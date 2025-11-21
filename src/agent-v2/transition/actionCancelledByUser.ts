import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ActionCancelledByUserSignal } from "../agentSignal.ts";

/**
 * 处理 action-cancelled-by-user 信号
 * 
 * Transition 效果：
 * - 检查 action 是否存在于 actionRequests 中
 * - 如果不存在，静默忽略该消息（正常情况：大模型可能已经率先 cancel 并删除了该 action）
 * - 如果存在，将 action response 添加到 actionResponses（type: 'cancelled'）
 * - 注意：actionRequests 保留（不删除），以便告知 LLM 这是用户主动取消的
 */
export const handleActionCancelledByUser = (
  signal: Immutable<ActionCancelledByUserSignal>,
  state: Immutable<AgentState>,
): Immutable<AgentState> => {
  // 检查 action 是否存在于 actionRequests 中
  // 如果不存在，静默忽略（正常情况：大模型可能已经率先 cancel 并删除了该 action）
  if (!(signal.actionRequestId in state.actionRequests)) {
    return state;
  }

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
  } as Immutable<AgentState>;
};

