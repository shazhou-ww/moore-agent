import type { FrozenJson } from "@hstore/core";
import type {
  AgentState,
  Signal,
  AssistantMessage,
  ToolMessage,
} from "../types/schema.ts";

/**
 * 将消息插入 messages 并保持按 timestamp 排序
 */
const insertMessage = (
  messages: FrozenJson<Signal[]>,
  newMessage: Signal,
): FrozenJson<Signal[]> => {
  const result = [...messages];
  let insertIndex = result.length;
  
  for (let i = 0; i < result.length; i++) {
    if (newMessage.timestamp < result[i]!.timestamp) {
      insertIndex = i;
      break;
    }
  }
  
  result.splice(insertIndex, 0, newMessage);
  return result;
};

/**
 * 检查工具消息是否已 fulfill 某个工具调用
 */
const isToolCallFulfilled = (
  assistantMessage: AssistantMessage,
  toolMessages: ReadonlyArray<ToolMessage>,
  toolCallId: string,
): boolean => {
  return toolMessages.some(
    (toolMsg) => toolMsg.callId === toolCallId && toolMsg.timestamp > assistantMessage.timestamp,
  );
};

/**
 * 获取尚未被 fulfill 的工具调用
 */
const getUnfulfilledToolCalls = (
  assistantMessage: AssistantMessage,
  toolMessages: ReadonlyArray<ToolMessage>,
): ReadonlyArray<{ id: string; name: string; input: string }> => {
  return assistantMessage.toolCalls.filter(
    (toolCall) => !isToolCallFulfilled(assistantMessage, toolMessages, toolCall.id),
  );
};

/**
 * 验证新消息的 timestamp 是否有效
 */
const isValidTimestamp = (
  newTimestamp: number,
  lastSentToLLMAt: number,
): boolean => {
  return newTimestamp > lastSentToLLMAt;
};

/**
 * 状态转换函数（通用版本）
 * 将信号应用到状态，返回新状态
 * 支持 AgentState 和 FrozenJson<AgentState> 类型
 */
export const transition = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Signal,
) => (state: T): T => {
  // 验证 timestamp
  if (!isValidTimestamp(signal.timestamp, state.lastSentToLLMAt)) {
    throw new Error(
      `Invalid timestamp: signal timestamp (${signal.timestamp}) must be greater than lastSentToLLMAt (${state.lastSentToLLMAt})`,
    );
  }
  
  // 插入消息并保持排序
  const newMessages = insertMessage(state.messages, signal);
  
  // 如果是 assistant message，更新 lastSentToLLMAt 为 assistant message 的 timestamp
  // 这表示我们已经将消息发送给 LLM 并收到了响应
  const newLastSentToLLMAt = signal.kind === "assistant" 
    ? signal.timestamp 
    : state.lastSentToLLMAt;
  
  // 返回新状态
  return {
    ...state,
    messages: newMessages,
    lastSentToLLMAt: newLastSentToLLMAt,
  } as T;
};

