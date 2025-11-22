import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ActionRequestRefinedSignal } from "../agentSignal.ts";

/**
 * 处理 action-request-refined 信号
 * 
 * Transition 效果：
 * - 将 action 的 parameter 更新为细化后的参数
 * - 注意：action 本身已经在 reaction-complete 时创建，这里只是细化参数
 */
export const handleActionRequestRefined = (
  signal: Immutable<ActionRequestRefinedSignal>,
  state: Immutable<AgentState>,
): Immutable<AgentState> => {
  // 检查 action 是否存在
  const action = state.actions[signal.actionId];
  if (!action) {
    console.warn(
      `Ignoring action-request-refined signal for actionRequestId ${signal.actionId}. ` +
      `Action does not exist.`
    );
    return state;
  }

  // 更新 action 的 parameter
  const updatedActions = {
    ...state.actions,
    [signal.actionId]: {
      ...action,
      parameter: signal.parameters,
    },
  };

  return {
    ...state,
    actions: updatedActions,
  };
};

