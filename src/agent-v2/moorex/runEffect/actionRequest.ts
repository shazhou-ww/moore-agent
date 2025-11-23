import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ActionRequestEffect } from "../agentEffects.ts";
import type { AgentSignal, ActionCompletedSignal } from "../agentSignal.ts";
import type { EffectInitializer, RunEffectOptions } from "./types.ts";
import type { Dispatch } from "./effectInitializer.ts";
import { createEffectInitializer } from "./effectInitializer.ts";

/**
 * 获取并验证 action request 和 parameters
 */
const getActionRequestAndParameters = (
  state: Immutable<AgentState>,
  actionId: string
): { actionName: string; parameters: string } | null => {
  // 从 state 获取 action
  const action = state.actions[actionId];
  if (!action) {
    console.warn(`Action not found for actionId: ${actionId}`);
    return null;
  }

  // 检查是否有 parameters
  if (!action.parameter) {
    console.warn(
      `Action parameters not found for actionId: ${actionId}`
    );
    return null;
  }

  return {
    actionName: action.request.actionName,
    parameters: action.parameter,
  };
};

/**
 * 发送 action completed 信号
 */
const dispatchActionCompleted = (
  actionId: string,
  result: string,
  dispatch: Dispatch
): void => {
  const signal: ActionCompletedSignal = {
    kind: "action-completed",
    actionId,
    result,
    timestamp: Date.now(),
  };
  dispatch(signal as Immutable<AgentSignal>);
};

/**
 * 创建 ActionRequestEffect 的初始器
 */
export const createActionRequestEffectInitializer = (
  effect: Immutable<ActionRequestEffect>,
  state: Immutable<AgentState>,
  key: string,
  options: RunEffectOptions
): EffectInitializer =>
  createEffectInitializer(
    async (dispatch: Dispatch, isCancelled: () => boolean) => {
      const {
        behavior: { act },
      } = options;
      const { actionId } = effect;

      // 获取并验证 action request 和 parameters
      const requestData = getActionRequestAndParameters(state, actionId);
      if (!requestData) {
        return;
      }

      console.log("actionRequest for key", key);
      // 调用 action
      const result = await act(actionId, requestData.actionName, requestData.parameters);

      console.log("result", result);

      if (isCancelled()) {
        return;
      }

      // 发送 action completed 信号
      dispatchActionCompleted(actionId, result, dispatch);
    }
  );
