import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ActionCompletedSignal } from "../agentSignal.ts";

/**
 * 处理 action-completed 信号
 * 
 * Transition 效果：
 * - 更新 action 的 response 为 completed 类型
 * - 注意：action 保留（用于历史追踪），不在此处移除
 */
export const handleActionCompleted = (
  signal: Immutable<ActionCompletedSignal>,
  state: Immutable<AgentState>,
): Immutable<AgentState> => {
  // 检查 action 是否存在
  const action = state.actions[signal.actionId];
  if (!action) {
    console.warn(
      `Ignoring action-completed signal for actionId ${signal.actionId}. ` +
      `Action does not exist.`
    );
    return state;
  }

  // 更新 action 的 response（completed 类型）
  const updatedActions = {
    ...state.actions,
    [signal.actionId]: {
      ...action,
      response: {
        type: "completed" as const,
        result: signal.result,
        timestamp: signal.timestamp,
      },
    },
  };

  return {
    ...state,
    actions: updatedActions,
  };
};

