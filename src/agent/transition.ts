import type { FrozenJson } from "@hstore/core";
import type {
  AgentState,
  Signal,
  AssistantMessage,
  ToolMessage,
  UserMessage,
  AssistantChunkSignal,
  AssistantMessageCompleteSignal,
  PartialMessage,
} from "../types/schema.ts";

/**
 * 将消息插入 messages 并保持按 timestamp 排序
 */
const insertMessage = <T extends UserMessage | ToolMessage | AssistantMessage>(
  messages: ReadonlyArray<T>,
  newMessage: T,
): ReadonlyArray<T> => {
  const result = [...messages] as T[];
  let insertIndex = result.length;
  
  for (let i = 0; i < result.length; i++) {
    if (newMessage.timestamp < result[i]!.timestamp) {
      insertIndex = i;
      break;
    }
  }
  
  result.splice(insertIndex, 0, newMessage);
  return result as ReadonlyArray<T>;
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
 * 处理 assistant-chunk 信号
 */
const handleAssistantChunk = <T extends AgentState | FrozenJson<AgentState>>(
  signal: AssistantChunkSignal,
  state: T,
): T => {
  // 如果已有 partialMessage 且 messageId 匹配，追加 chunk
  if (state.partialMessage && state.partialMessage.messageId === signal.messageId) {
    return {
      ...state,
      partialMessage: {
        messageId: state.partialMessage.messageId,
        chunks: [...Array.from(state.partialMessage.chunks), signal.chunk],
      },
    } as T;
  }

  // 如果没有 partialMessage 或 messageId 不匹配，创建新的
  return {
    ...state,
    partialMessage: {
      messageId: signal.messageId,
      chunks: [signal.chunk],
    },
  } as T;
};

/**
 * 处理 assistant-complete 信号
 */
const handleAssistantComplete = <T extends AgentState | FrozenJson<AgentState>>(
  signal: AssistantMessageCompleteSignal,
  state: T,
): T => {
  if (!state.partialMessage || state.partialMessage.messageId !== signal.messageId) {
    throw new Error(`Partial message not found for messageId: ${signal.messageId}`);
  }

  // 拼装完整的 assistant message
  const content = state.partialMessage.chunks.join("");
  const assistantMessage: AssistantMessage = {
    id: signal.messageId,
    kind: "assistant",
    content,
    toolCalls: signal.toolCalls,
    timestamp: signal.timestamp,
  };

  // 插入消息并保持排序
  const newMessages = insertMessage(state.messages as ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>, assistantMessage);

  // 清除 partialMessage
  const newPartialMessage = null;

  // 更新 lastSentToLLMAt
  const newLastSentToLLMAt = signal.timestamp;

  return {
    ...state,
    messages: newMessages,
    partialMessage: newPartialMessage,
    lastSentToLLMAt: newLastSentToLLMAt,
  } as T;
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

  // 处理不同类型的信号
  if (signal.kind === "assistant-chunk") {
    return handleAssistantChunk(signal, state);
  }

  if (signal.kind === "assistant-complete") {
    return handleAssistantComplete(signal, state);
  }

  // 处理 user 和 tool 消息
  if (signal.kind === "user" || signal.kind === "tool") {
    const newMessages = insertMessage(state.messages as ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>, signal);
    return {
      ...state,
      messages: newMessages,
    } as T;
  }
  
  // 未知信号类型
  return state;
};

