import type { Immutable } from "mutative";
import type { AgentEffect } from "../agentEffects.ts";
import type { AgentSignal, ActionCompletedSignal } from "../agentSignal.ts";
import type {
  EffectInitializer,
  CallActionFn,
  GetActionParametersFn,
} from "./types.ts";
import { now } from "../../utils/time.ts";

/**
 * 创建 ActionRequestEffect 的初始器
 */
export const createActionRequestEffectInitializer = (
  effect: Immutable<Extract<AgentEffect, { kind: "action-request" }>>,
  callAction: CallActionFn,
  getActionParameters: GetActionParametersFn,
): EffectInitializer => {
  let canceled = false;
  // 从 key 中提取 actionRequestId（例如 "action-request-{actionRequestId}"）
  const actionRequestId = effect.key.replace("action-request-", "");

  return {
    start: async (dispatch: (signal: Immutable<AgentSignal>) => void) => {
      if (canceled) {
        return;
      }

      try {
        // 从 state 中获取对应的 parameters
        const parameters = getActionParameters(actionRequestId);

        if (!parameters) {
          throw new Error(
            `Action parameters not found for actionRequestId: ${actionRequestId}`,
          );
        }

        // 调用 action
        const result = await callAction(effect.request.actionName, parameters);

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

