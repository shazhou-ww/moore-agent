import type { FrozenJson } from "@hstore/core";
import type { AgentState, HistoryMessage, AssistantChunk, PendingStreaming } from "./agentState.ts";
import type { AgentSignal } from "./agentSignal.ts";

/**
 * 将消息追加到 historyMessages 的末尾
 * 
 * 假设新消息的 timestamp 一定晚于最后一个消息。
 * 如果 timestamp 不满足条件，会 log warning 并返回 null。
 * 
 * @returns 如果成功追加，返回新的消息数组；如果不满足条件，返回 null
 */
const appendHistoryMessage = (
  messages: ReadonlyArray<HistoryMessage>,
  newMessage: HistoryMessage,
): ReadonlyArray<HistoryMessage> | null => {
  // 如果 historyMessages 为空，直接追加
  if (messages.length === 0) {
    return [newMessage];
  }

  // 检查新消息的 timestamp 是否晚于最后一个消息
  const lastMessage = messages[messages.length - 1]!;
  if (newMessage.timestamp >= lastMessage.timestamp) {
    // 直接追加到末尾
    return [...messages, newMessage];
  }

  // timestamp 不满足条件，log warning 并返回 null
  const messageType = newMessage.type === "user" ? "user message" : "assistant message";
  console.warn(
    `Ignoring ${messageType} with timestamp ${newMessage.timestamp} ` +
    `(messageId: ${newMessage.id}). Last message timestamp: ${lastMessage.timestamp}. ` +
    `This message would break the effectsAt calculation assumption.`
  );
  
  return null;
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
 * - 假设收到的 userMessage 的 timestamp 一定是晚于 historyMessages 的最后一个的
 * - 如果 timestamp 晚于最后一个消息，直接追加到 historyMessages 的末尾
 * - 如果 timestamp 不满足条件，log warning 并忽略这条 message（不更新状态）
 * - 不更新 lastSentToLLMAt（用户消息不是 LLM 输出）
 * 
 * 注意：我们不会将消息插入到 historyMessages 中间，因为这会影响 effectsAt 的计算假设
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

  const historyMessages = state.historyMessages as ReadonlyArray<HistoryMessage>;
  const newHistoryMessages = appendHistoryMessage(
    historyMessages,
    userMessage,
  );

  // 如果追加失败（返回 null），返回原状态
  if (newHistoryMessages === null) {
    return state;
  }

  return {
    ...state,
    historyMessages: newHistoryMessages,
  } as T;
};

/**
 * 处理 action-completed 信号
 * 
 * Transition 效果：
 * - 将 action response 添加到 actionResponses（type: 'completed'）
 * - 注意：actionRequests 保留（用于历史追踪），不在此处移除
 */
const handleActionCompleted = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "action-completed" }>,
  state: T,
): T => {
  // 添加 action response（completed 类型）
  const newActionResponses = {
    ...state.actionResponses,
    [signal.actionRequestId]: {
      type: "completed" as const,
      result: signal.result,
      timestamp: signal.timestamp,
    },
  };

  return {
    ...state,
    actionResponses: newActionResponses,
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
 * 处理 action-cancelled-by-user 信号
 * 
 * Transition 效果：
 * - 将 action response 添加到 actionResponses（type: 'cancelled'）
 * - 注意：actionRequests 保留（不删除），以便告知 LLM 这是用户主动取消的
 */
const handleActionCancelledByUser = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "action-cancelled-by-user" }>,
  state: T,
): T => {
  // 添加 action response（cancelled 类型）
  const newActionResponses = {
    ...state.actionResponses,
    [signal.actionRequestId]: {
      type: "cancelled" as const,
      timestamp: signal.timestamp,
    },
  };

  return {
    ...state,
    actionResponses: newActionResponses,
  } as T;
};

/**
 * 处理 assistant-chunk-received 信号
 * 
 * Transition 效果：
 * - 将 chunk 添加到 pendingStreaming
 * - 如果 pendingStreaming 不存在或 messageId 不匹配，创建新的 pendingStreaming
 * - 不更新 lastSentToLLMAt（streaming 尚未完成）
 */
const handleAssistantChunkReceived = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "assistant-chunk-received" }>,
  state: T,
): T => {
  const newChunk: AssistantChunk = {
    content: signal.chunk,
  };

  // 如果 pendingStreaming 不存在或 messageId 不匹配，需要确定 kind
  // 这里假设如果 pendingStreaming 不存在，我们需要从上下文推断
  // 但实际上，kind 应该在 effect 生成时确定，这里我们暂时使用 "reply" 作为默认值
  // 更好的做法是在 effect 中明确指定 kind
  const currentStreaming = state.pendingStreaming;
  
  if (currentStreaming && currentStreaming.messageId === signal.messageId) {
    // 追加到现有的 streaming
    const newPendingStreaming: PendingStreaming = {
      ...currentStreaming,
      chunks: [...currentStreaming.chunks, newChunk],
    };
    return {
      ...state,
      pendingStreaming: newPendingStreaming,
    } as T;
  } else {
    // 创建新的 streaming（这种情况不应该发生，因为 messageId 应该在 effect 生成时确定）
    // 但为了健壮性，我们创建一个新的
    const newPendingStreaming: PendingStreaming = {
      messageId: signal.messageId,
      kind: "reply", // 默认值，实际应该从 effect 中获取
      chunks: [newChunk],
    };
    return {
      ...state,
      pendingStreaming: newPendingStreaming,
    } as T;
  }
};

/**
 * 处理 assistant-message-complete 信号（用于 reply）
 * 
 * Transition 效果：
 * - 假设收到的 signal 的 timestamp 一定是晚于 historyMessages 的最后一个的
 * - 将 pendingStreaming 中的 chunks 合并成完整的 assistant 消息内容
 * - 如果 timestamp 晚于最后一个消息，直接追加到 historyMessages 的末尾
 * - 如果 timestamp 不满足条件，log warning 并忽略这条 message（清空 pendingStreaming，但不更新 historyMessages 和 lastSentToLLMAt）
 * - 清空 pendingStreaming
 * - 更新 lastSentToLLMAt 为 signal.timestamp（仅当消息被接受时）
 * 
 * 注意：我们不会将消息插入到 historyMessages 中间，因为这会影响 effectsAt 的计算假设
 */
const handleAssistantMessageComplete = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "assistant-message-complete" }>,
  state: T,
): T => {
  // 检查 pendingStreaming 是否存在且 messageId 匹配
  const currentStreaming = state.pendingStreaming;
  if (!currentStreaming || currentStreaming.messageId !== signal.messageId) {
    console.warn(
      `Ignoring assistant-message-complete signal for messageId ${signal.messageId}. ` +
      `No matching pendingStreaming found.`
    );
    return state;
  }

  // 合并所有 pending chunks 成完整内容
  const content = currentStreaming.chunks.map((chunk) => chunk.content).join("");

  const assistantMessage: HistoryMessage = {
    id: signal.messageId,
    type: "assistant",
    content,
    timestamp: signal.timestamp,
  };

  const historyMessages = state.historyMessages as ReadonlyArray<HistoryMessage>;
  const newHistoryMessages = appendHistoryMessage(
    historyMessages,
    assistantMessage,
  );

  // 如果追加失败（返回 null），清空 pendingStreaming 但不更新 historyMessages 和 lastSentToLLMAt
  if (newHistoryMessages === null) {
    return {
      ...state,
      pendingStreaming: null,
    } as T;
  }

  // 成功追加，更新所有相关状态
  return {
    ...state,
    historyMessages: newHistoryMessages,
    pendingStreaming: null,
    lastSentToLLMAt: signal.timestamp,
  } as T;
};

/**
 * 处理 reaction-complete 信号
 * 
 * Transition 效果：
 * - 清空 pendingStreaming（reaction 的 streaming 完成）
 * - 根据决策结果处理：
 *   - cancelActions: 这些 action 会通过 action-cancelled-by-user signal 单独处理
 *   - newActions: 这些会触发后续的 RefineActionCallEffect（通过 effectsAt 推导）
 *   - shouldReply: 如果为 true，会触发 ReplyToUserEffect（通过 effectsAt 推导）
 * - 更新 lastSentToLLMAt 为 signal.timestamp
 * 
 * 注意：reaction-complete 本身不直接修改 actionRequests 或生成新的 effects，
 * 这些会通过后续的 signals 和 effectsAt 推导来处理
 */
const handleReactionComplete = <T extends AgentState | FrozenJson<AgentState>>(
  signal: Extract<AgentSignal, { kind: "reaction-complete" }>,
  state: T,
): T => {
  // 检查 pendingStreaming 是否存在且 messageId 匹配
  const currentStreaming = state.pendingStreaming;
  if (!currentStreaming || currentStreaming.messageId !== signal.messageId) {
    console.warn(
      `Ignoring reaction-complete signal for messageId ${signal.messageId}. ` +
      `No matching pendingStreaming found.`
    );
    return state;
  }

  // 清空 pendingStreaming 并更新 lastSentToLLMAt
  // 决策结果的处理会通过后续的 signals 和 effectsAt 推导来完成
  return {
    ...state,
    pendingStreaming: null,
    lastSentToLLMAt: signal.timestamp,
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
    signal.kind === "assistant-message-complete" ||
    signal.kind === "reaction-complete"
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

    case "action-completed":
      return handleActionCompleted(signal, state);

    case "action-requested":
      return handleActionRequested(signal, state);

    case "action-cancelled-by-user":
      return handleActionCancelledByUser(signal, state);

    case "assistant-chunk-received":
      return handleAssistantChunkReceived(signal, state);

    case "assistant-message-complete":
      return handleAssistantMessageComplete(signal, state);

    case "reaction-complete":
      return handleReactionComplete(signal, state);

    default:
      // 类型守卫：确保所有信号类型都被处理
      const _exhaustive: never = signal;
      return _exhaustive;
  }
};

