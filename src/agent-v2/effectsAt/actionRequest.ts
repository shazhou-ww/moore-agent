import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ActionRequestEffect } from "../agentEffects.ts";

/**
 * 提取所有 ActionRequestEffect
 * 
 * 所有有 parameters 但没有 response 的 action requests 都需要执行（可以并发）
 */
export const extractActionRequestEffects = (
  state: Immutable<AgentState>,
): ActionRequestEffect[] => {
  const effects: ActionRequestEffect[] = [];

  for (const [actionRequestId, request] of Object.entries(state.actionRequests)) {
    // 如果已经有 response，跳过
    if (actionRequestId in state.actionResponses) {
      continue;
    }

    // 如果有 parameters，需要执行
    if (actionRequestId in state.actionParameters) {
      const actionRequestEffect: ActionRequestEffect = {
        key: `action-request-${actionRequestId}`,
        kind: "action-request",
        request: {
          ...request,
          // 注意：parameters 不在 request 中，而是单独存储在 actionParameters 中
        },
      };

      effects.push(actionRequestEffect);
    }
  }

  return effects;
};

