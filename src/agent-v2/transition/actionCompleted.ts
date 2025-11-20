import type { FrozenJson } from "@hstore/core";
import type { AgentState } from "../agentState.ts";
import type { ActionCompletedSignal } from "../agentSignal.ts";

/**
 * 处理 action-completed 信号
 * 
 * Transition 效果：
 * - 将 action response 添加到 actionResponses（type: 'completed'）
 * - 注意：actionRequests 保留（用于历史追踪），不在此处移除
 */
export const handleActionCompleted = <T extends AgentState | FrozenJson<AgentState>>(
  signal: ActionCompletedSignal,
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

