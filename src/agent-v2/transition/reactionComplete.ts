import type { Immutable } from "mutative";
import type { AgentState, ReplyToUserContext } from "../agentState.ts";
import type { ReactionCompleteSignal, ReplyToUserDecision, AdjustActionsDecision } from "../agentSignal.ts";
import { computeReplyKey } from "./utils.ts";

/**
 * 处理 reply-to-user 决策
 */
const handleReplyToUserDecision = (
  decision: Immutable<ReplyToUserDecision>,
  timestamp: number,
  state: Immutable<AgentState>,
): Immutable<AgentState> => {
  const { lastHistoryMessageId, relatedActionIds } = decision;
  
  // 先对 Action Ids 进行排序，确保 hash 计算的一致性
  const sortedActionIds = [...relatedActionIds].sort();
  
  // messageId 就是 hash(lastHistoryMessageId + sorted actionIds)
  // 这与 ReplyToUserEffect 的 key 保持一致
  const messageId = computeReplyKey(lastHistoryMessageId, sortedActionIds);
  
  // 创建 reply context
  const replyContext: ReplyToUserContext = {
    messageId,
    lastHistoryMessageId,
    relatedActionIds: sortedActionIds,
    chunks: [],
  };
  
  // 添加到 replies（使用 messageId 作为 key）
  const newReplies = {
    ...state.replies,
    [messageId]: replyContext,
  };
  
  return {
    ...state,
    replies: newReplies,
    lastReactionTimestamp: timestamp,
  } as Immutable<AgentState>;
};

/**
 * 处理 adjust-actions 决策
 */
const handleAdjustActionsDecision = (
  decision: Immutable<AdjustActionsDecision>,
  timestamp: number,
  state: Immutable<AgentState>,
): Immutable<AgentState> => {
  const { cancelActions, newActions } = decision;
  
  // 创建 mutable 的副本
  const newActionRequests = { ...state.actionRequests };
  const newActionResponses = { ...state.actionResponses };
  
  // 处理 cancelActions：从 actionRequests 中删除，并添加 cancelled 类型的 response
  // 如果一个要 cancel 的 action 已经 respond 过了，那就忽略，不用 cancel 了
  for (const actionRequestId of cancelActions) {
    // 如果该 action 已经有 response，忽略 cancel 操作
    if (actionRequestId in state.actionResponses) {
      continue;
    }
    
    // 从 actionRequests 中删除
    delete newActionRequests[actionRequestId];
    
    // 添加 cancelled 类型的 response
    newActionResponses[actionRequestId] = {
      type: "cancelled" as const,
      timestamp,
    };
  }
  
  // 处理 newActions：创建新的 action requests
  // 这些 action requests 会通过后续的 RefineActionCallEffect 细化参数
  // 注意：不初始化 actionParameters，缺失的 parameters 可以提示需要对应的 refine effect
  for (const newAction of newActions) {
    // 创建新的 action request（不包含 parameters，parameters 单独存储）
    newActionRequests[newAction.actionRequestId] = {
      actionName: newAction.actionName,
      intention: newAction.initialIntent,
      timestamp,
    };
  }
  
  return {
    ...state,
    actionRequests: newActionRequests,
    actionResponses: newActionResponses,
    lastReactionTimestamp: timestamp,
  } as Immutable<AgentState>;
};

/**
 * 处理 reaction-complete 信号
 * 
 * Transition 效果：
 * - Reaction 是 non-streaming 的，直接返回决策结果
 * - 根据决策结果处理：
 *   - 如果是 reply-to-user：添加到 replies（等待后续的 ReplyToUserEffect 触发 streaming）
 *   - 如果是 adjust-actions：直接调整 action requests
 * - 更新 lastReactionTimestamp 为 signal.timestamp
 */
/**
 * 处理 noop 决策
 */
const handleNoopDecision = (
  timestamp: number,
  state: Immutable<AgentState>,
): Immutable<AgentState> => {
  // noop：什么都不需要调整，只更新 lastReactionTimestamp
  return {
    ...state,
    lastReactionTimestamp: timestamp,
  } as Immutable<AgentState>;
};

/**
 * 处理 reaction-complete 信号
 * 
 * Transition 效果：
 * - Reaction 是 non-streaming 的，直接返回决策结果
 * - 根据决策结果处理：
 *   - 如果是 reply-to-user：添加到 replies（等待后续的 ReplyToUserEffect 触发 streaming）
 *   - 如果是 adjust-actions：直接调整 action requests
 *   - 如果是 noop：什么都不需要调整，只更新 lastReactionTimestamp
 * - 更新 lastReactionTimestamp 为 signal.timestamp
 */
export const handleReactionComplete = (
  signal: Immutable<ReactionCompleteSignal>,
  state: Immutable<AgentState>,
): Immutable<AgentState> => {
  // Reaction 是 non-streaming 的，直接处理决策结果
  if (signal.decision.type === "reply-to-user") {
    return handleReplyToUserDecision(signal.decision, signal.timestamp, state);
  } else if (signal.decision.type === "adjust-actions") {
    return handleAdjustActionsDecision(signal.decision, signal.timestamp, state);
  } else if (signal.decision.type === "noop") {
    return handleNoopDecision(signal.timestamp, state);
  }
  
  // 默认情况（不应该发生，但为了类型安全）
  return {
    ...state,
    lastReactionTimestamp: signal.timestamp,
  } as Immutable<AgentState>;
};

