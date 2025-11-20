import type { FrozenJson } from "@hstore/core";
import type { AgentState } from "../agentState.ts";
import type { ActionRequestRefinedSignal } from "../agentSignal.ts";

/**
 * 处理 action-request-refined 信号
 * 
 * Transition 效果：
 * - 将 action request 的参数添加到 actionParameters
 * - 注意：action request 本身已经在 reaction-complete 时创建，这里只是细化参数
 */
export const handleActionRequestRefined = <T extends AgentState | FrozenJson<AgentState>>(
  signal: ActionRequestRefinedSignal,
  state: T,
): T => {
  // 检查 action request 是否存在
  if (!(signal.actionRequestId in state.actionRequests)) {
    console.warn(
      `Ignoring action-request-refined signal for actionRequestId ${signal.actionRequestId}. ` +
      `Action request does not exist.`
    );
    return state;
  }

  // 更新 action parameters
  const newActionParameters = {
    ...state.actionParameters,
    [signal.actionRequestId]: signal.parameters,
  };

  return {
    ...state,
    actionParameters: newActionParameters,
  } as T;
};

