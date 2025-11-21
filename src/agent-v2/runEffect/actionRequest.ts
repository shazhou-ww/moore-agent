import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ActionRequestEffect } from "../agentEffects.ts";
import type { AgentSignal, ActionCompletedSignal } from "../agentSignal.ts";
import type { EffectInitializer, CallActionFn } from "./types.ts";
import { now } from "../../utils/time.ts";

/**
 * 创建 ActionRequestEffect 的初始器
 */
export const createActionRequestEffectInitializer = (
  effect: Immutable<ActionRequestEffect>,
  state: Immutable<AgentState>,
  callAction: CallActionFn,
): EffectInitializer => {
  let canceled = false;
  // actionRequestId 从 effect 中获取
  const actionRequestId = effect.actionRequestId;

  return {
    start: async (dispatch: (signal: Immutable<AgentSignal>) => void) => {
      if (canceled) {
        return;
      }

      try {
        // 从 state 获取 action request
        const request = state.actionRequests[actionRequestId];
        if (!request) {
          throw new Error(`Action request not found for actionRequestId: ${actionRequestId}`);
        }

        // 从 state.actionParameters 中获取对应的 parameters
        const parameters = state.actionParameters[actionRequestId];

        if (!parameters) {
          throw new Error(
            `Action parameters not found for actionRequestId: ${actionRequestId}`,
          );
        }

        // 调用 action
        const result = await callAction(request.actionName, parameters);

        if (canceled) {
          return;
        }

        const signal: ActionCompletedSignal = {
          kind: "action-completed",
          actionRequestId,
          result,
          timestamp: now(),
        };

        dispatch(signal as Immutable<AgentSignal>);
      } catch (error) {
        if (!canceled) {
          console.error("ActionRequestEffect failed:", error);
          throw error;
        }
      }
    },
    cancel: () => {
      canceled = true;
    },
  };
};

