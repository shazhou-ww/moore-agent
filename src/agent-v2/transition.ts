import type { FrozenJson } from "@hstore/core";
import type { AgentState, HistoryMessage, AssistantChunk } from "./agentState.ts";
import type { AgentSignal } from "./agentSignal.ts";

/**
 * 将消息插入 historyMessages 并保持按 timestamp 排序
 */
const insertHistoryMessage = (
  messages: ReadonlyArray<HistoryMessage>,
  newMessage: HistoryMessage,
): ReadonlyArray<HistoryMessage> => {
  const result = [...messages] as HistoryMessage[];
  let insertIndex = result.length;
  
  for (let i = 0; i < result.length; i++) {
    if (newMessage.timestamp < result[i]!.timestamp) {
      insertIndex = i;
      break;
    }
  }
  
  result.splice(insertIndex, 0, newMessage);
  return result as ReadonlyArray<HistoryMessage>;
};

/**
 * 验证新消息的 timestamp 是否有效
 * 新消息的 timestamp 必须大于 lastSentToLLMAt
 */
const isValidTimestamp = (
  newTimestamp: number,
  lastSentToLLMAt: number,
): boolean => {
  return newTimestamp > lastSentToLLMAt;
};

/**
 * 处理 user-message-received 信号
 * 
 * Transition 效果：
 * - 将用户消息添加到 historyMessages，保持按 timestamp 排序
 * - 不更新 lastSentToLLMAt（用户消息不是 LLM 输出）
 */
const handleUserMessageReceived = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "user-message-received" }>,
  state: T,
): T => {
  const userMessage: HistoryMessage = {
    id: signal.messageId,
    type: "user",
    content: signal.content,
    timestamp: signal.timestamp,
  };

  const newHistoryMessages = insertHistoryMessage(
    state.historyMessages as ReadonlyArray<HistoryMessage>,
    userMessage,
  );

  return {
    ...state,
    historyMessages: newHistoryMessages,
  } as T;
};

/**
 * 处理 action-responded 信号
 * 
 * Transition 效果：
 * - 将 action response 添加到 actionResponses
 * - 从 focusedActionRequests 中移除对应的 actionRequestId（如果存在）
 * - 注意：actionRequests 保留（用于历史追踪），不在此处移除
 */
const handleActionResponded = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "action-responded" }>,
  state: T,
): T => {
  // 添加 action response
  const newActionResponses = {
    ...state.actionResponses,
    [signal.actionRequestId]: {
      result: signal.result,
      timestamp: signal.timestamp,
    },
  };

  // 从 focusedActionRequests 中移除（如果存在）
  // focusedActionRequests 只包含未完成的 action requests
  const newFocusedActionRequests = state.focusedActionRequests.filter(
    (id) => id !== signal.actionRequestId,
  );

  return {
    ...state,
    actionResponses: newActionResponses,
    focusedActionRequests: newFocusedActionRequests,
  } as T;
};

/**
 * 处理 action-requested 信号
 * 
 * Transition 效果：
 * - 将 action request 添加到 actionRequests
 * - 注意：focusedActionRequests 的更新应该由 effectsAt 决定，这里不自动添加
 */
const handleActionRequested = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "action-requested" }>,
  state: T,
): T => {
  const newActionRequests = {
    ...state.actionRequests,
    [signal.actionRequestId]: {
      actionName: signal.actionName,
      parameters: signal.parameters,
      intention: signal.intention,
      timestamp: signal.timestamp,
    },
  };

  return {
    ...state,
    actionRequests: newActionRequests,
  } as T;
};

/**
 * 处理 action-cancelled 信号
 * 
 * Transition 效果：
 * - 从 actionRequests 中移除对应的 request（如果存在）
 * - 从 focusedActionRequests 中移除对应的 actionRequestId（如果存在）
 */
const handleActionCancelled = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "action-cancelled" }>,
  state: T,
): T => {
  // 从 actionRequests 中移除（如果存在）
  const { [signal.actionRequestId]: _, ...newActionRequests } = state.actionRequests;

  // 从 focusedActionRequests 中移除（如果存在）
  const newFocusedActionRequests = state.focusedActionRequests.filter(
    (id) => id !== signal.actionRequestId,
  );

  return {
    ...state,
    actionRequests: newActionRequests,
    focusedActionRequests: newFocusedActionRequests,
  } as T;
};

/**
 * 处理 assistant-chunk-received 信号
 * 
 * Transition 效果：
 * - 将 chunk 添加到 pendingChunks
 * - 不更新 lastSentToLLMAt（streaming 尚未完成）
 */
const handleAssistantChunkReceived = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "assistant-chunk-received" }>,
  state: T,
): T => {
  const newChunk: AssistantChunk = {
    content: signal.chunk,
  };

  const newPendingChunks = [...state.pendingChunks, newChunk];

  return {
    ...state,
    pendingChunks: newPendingChunks,
  } as T;
};

/**
 * 处理 assistant-message-complete 信号
 * 
 * Transition 效果：
 * - 将 pendingChunks 合并成完整的 assistant 消息内容
 * - 将完整的 assistant 消息添加到 historyMessages，保持按 timestamp 排序
 * - 清空 pendingChunks
 * - 更新 lastSentToLLMAt 为 signal.timestamp（表示 LLM 输出已完成）
 */
const handleAssistantMessageComplete = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "assistant-message-complete" }>,
  state: T,
): T => {
  // 合并所有 pending chunks 成完整内容
  const content = state.pendingChunks.map((chunk) => chunk.content).join("");

  const assistantMessage: HistoryMessage = {
    id: signal.messageId,
    type: "assistant",
    content,
    timestamp: signal.timestamp,
  };

  // 插入消息并保持排序
  const newHistoryMessages = insertHistoryMessage(
    state.historyMessages as ReadonlyArray<HistoryMessage>,
    assistantMessage,
  );

  // 清空 pending chunks
  const newPendingChunks: AssistantChunk[] = [];

  // 更新 lastSentToLLMAt
  const newLastSentToLLMAt = signal.timestamp;

  return {
    ...state,
    historyMessages: newHistoryMessages,
    pendingChunks: newPendingChunks,
    lastSentToLLMAt: newLastSentToLLMAt,
  } as T;
};

/**
 * 状态转换函数（通用版本）
 * 将信号应用到状态，返回新状态
 * 支持 AgentState 和 FrozenJson<AgentState> 类型
 * 
 * 符合 moorex 的 transition signature: (signal) => (state) => state
 */
export const transition = <T extends AgentState | FrozenJson<AgentState>>(
  signal: AgentSignal,
) => (state: T): T => {
  // 验证 timestamp（对于需要验证的信号）
  if (
    signal.kind === "user-message-received" ||
    signal.kind === "assistant-chunk-received" ||
    signal.kind === "assistant-message-complete"
  ) {
    if (!isValidTimestamp(signal.timestamp, state.lastSentToLLMAt)) {
      throw new Error(
        `Invalid timestamp: signal timestamp (${signal.timestamp}) must be greater than lastSentToLLMAt (${state.lastSentToLLMAt})`,
      );
    }
  }

  // 处理不同类型的信号
  switch (signal.kind) {
    case "user-message-received":
      return handleUserMessageReceived(signal, state);

    case "action-responded":
      return handleActionResponded(signal, state);

    case "action-requested":
      return handleActionRequested(signal, state);

    case "action-cancelled":
      return handleActionCancelled(signal, state);

    case "assistant-chunk-received":
      return handleAssistantChunkReceived(signal, state);

    case "assistant-message-complete":
      return handleAssistantMessageComplete(signal, state);

    default:
      // 类型守卫：确保所有信号类型都被处理
      const _exhaustive: never = signal;
      return _exhaustive;
  }
};

