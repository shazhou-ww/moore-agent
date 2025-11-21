import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ActionRequestEffect } from "../agentEffects.ts";
import type { EffectInitializer, RunEffectOptions } from "./types.ts";
import type { Dispatch } from "./effectInitializer.ts";
import { createEffectInitializer } from "./effectInitializer.ts";
import { now } from "../../utils/time.ts";

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
      const { callAction } = options;
      const { actionRequestId } = effect;

      // 从 state 获取 action request
      const request = state.actionRequests[actionRequestId];
      if (!request) {
        console.warn(
          `Action request not found for actionRequestId: ${actionRequestId}`
        );
        return;
      }

      // 从 state.actionParameters 中获取对应的 parameters
      const parameters = state.actionParameters[actionRequestId];

      if (!parameters) {
        console.warn(
          `Action parameters not found for actionRequestId: ${actionRequestId}`
        );
        return;
      }

      // 调用 action
      const result = await callAction(request.actionName, parameters);

      if (isCancelled()) return; // 如果被取消，直接返回

      dispatch({
        kind: "action-completed",
        actionRequestId,
        result,
        timestamp: now(),
      });
    }
  );
