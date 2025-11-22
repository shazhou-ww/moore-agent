import type { Immutable } from "mutative";
import type { AgentState, ReplyToUserContext } from "../agentState.ts";
import type { ReactionCompleteSignal, ReplyToUserDecisionExt, AdjustActionsDecisionExt } from "../agentSignal.ts";

/**
 * 处理 reply-to-user 决策
 */
const handleReplyToUserDecision = (
  decision: Immutable<ReplyToUserDecisionExt>,
  timestamp: number,
  state: Immutable<AgentState>,
): Immutable<AgentState> => {
  const { messageId, lastHistoryMessageId, relatedActionIds } = decision;
  
  // 先对 Action Ids 进行排序
  const sortedActionIds = [...relatedActionIds].sort();
  
  // 创建 reply context（使用 signal 带来的 messageId）
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
  };
};

/**
 * 处理 adjust-actions 决策
 */
const handleAdjustActionsDecision = (
  decision: Immutable<AdjustActionsDecisionExt>,
  timestamp: number,
  state: Immutable<AgentState>,
): Immutable<AgentState> => {
  const { cancelActions, newActions: newActionsToCreate } = decision;
  
  // 创建 mutable 的副本
  const updatedActions = { ...state.actions };
  
  // 处理 cancelActions：更新 response 为 cancelled 类型
  // 如果一个要 cancel 的 action 已经 respond 过了，那就忽略，不用 cancel 了
  for (const actionId of cancelActions) {
    // 如果该 action 已经有 response，忽略 cancel 操作
    const action = updatedActions[actionId];
    if (action && action.response) {
      continue;
    }
    
    // 如果 action 不存在，跳过
    if (!action) {
      continue;
    }
    
    // 更新 response 为 cancelled 类型
    updatedActions[actionId] = {
      ...action,
      response: {
        type: "cancelled" as const,
        timestamp,
      },
    };
  }
  
  // 处理 newActions：创建新的 actions（使用 signal 带来的 actionId）
  // 这些 actions 会通过后续的 RefineActionCallEffect 细化参数
  // 注意：不初始化 parameter，缺失的 parameter 可以提示需要对应的 refine effect
  for (const newAction of newActionsToCreate) {
    // 创建新的 action（不包含 parameter，parameter 通过 refine effect 添加）
    updatedActions[newAction.actionId] = {
      request: {
        actionName: newAction.actionName,
        intention: newAction.initialIntent,
        timestamp,
      },
      response: null,
      parameter: null,
    };
  }
  
  return {
    ...state,
    actions: updatedActions,
    lastReactionTimestamp: timestamp,
  };
};

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
  };
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
  };
};

