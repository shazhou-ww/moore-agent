import type { AgentState } from "../types/state.ts";
import type { Signal } from "../types/state.ts";
import type { AssistantMessage, ToolMessage, UserMessage } from "../types/messages.ts";

/**
 * 将消息插入 messages 并保持按 timestamp 排序
 */
const insertMessage = (
  messages: ReadonlyArray<Signal>,
  newMessage: Signal,
): ReadonlyArray<Signal> => {
  const result: Signal[] = [...messages];
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
): ReadonlyArray<{ id: string; name: string; input: Record<string, unknown> }> => {
  if (!assistantMessage.toolCalls) {
    return [];
  }
  
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
 * 状态转换函数
 * 将信号应用到状态，返回新状态
 */
export const transition = (signal: Signal) => (state: AgentState): AgentState => {
  // 验证 timestamp
  if (!isValidTimestamp(signal.timestamp, state.lastSentToLLMAt)) {
    throw new Error(
      `Invalid timestamp: signal timestamp (${signal.timestamp}) must be greater than lastSentToLLMAt (${state.lastSentToLLMAt})`,
    );
  }
  
  // 插入消息并保持排序
  const newMessages = insertMessage(state.messages, signal);
  
  // 返回新状态
  return {
    ...state,
    messages: newMessages,
  };
};

