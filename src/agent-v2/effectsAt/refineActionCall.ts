import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { RefineActionCallEffect } from "../agentEffects.ts";

/**
 * 提取所有 RefineActionCallEffect
 * 
 * 所有没有 parameters 的 action requests 都需要细化（可以并发）
 */
export const extractRefineActionCallEffects = (
  state: Immutable<AgentState>,
): RefineActionCallEffect[] => {
  const effects: RefineActionCallEffect[] = [];

  for (const [actionRequestId, request] of Object.entries(state.actionRequests)) {
    // 如果已经有 response，跳过
    if (actionRequestId in state.actionResponses) {
      continue;
    }

    // 如果没有 parameters，需要细化
    if (!(actionRequestId in state.actionParameters)) {
      const actionDefinition = state.actions[request.actionName];
      if (!actionDefinition) {
        console.warn(
          `Action definition not found for actionName: ${request.actionName}. ` +
          `Skipping RefineActionCallEffect for actionRequestId: ${actionRequestId}.`
        );
        continue;
      }

      // 收集最近的 action responses（用于上下文）
      const recentActionResponses = Object.entries(state.actionResponses)
        .filter(([_, response]) => response.timestamp > request.timestamp)
        .map(([id, response]) => {
          const req = state.actionRequests[id];
          return {
            actionRequestId: id,
            actionName: req?.actionName || "unknown",
            type: response.type,
            result: response.type === "completed" ? response.result : undefined,
          };
        });

      // 收集其他进行中的 actions（用于上下文）
      const relatedOngoingActions = Object.entries(state.actionRequests)
        .filter(
          ([id, _]) =>
            id !== actionRequestId && !(id in state.actionResponses),
        )
        .map(([id, req]) => ({
          actionRequestId: id,
          actionName: req.actionName,
          intention: req.intention,
        }));

      const refineEffect: RefineActionCallEffect = {
        key: `refine-action-${actionRequestId}`,
        kind: "refine-action-call",
        systemPrompts: state.systemPrompts,
        messageWindow: Array.from(state.historyMessages),
        targetAction: {
          name: request.actionName,
          ...actionDefinition,
        },
        initialIntent: request.intention,
        context: {
          recentActionResponses: recentActionResponses.length > 0 ? Array.from(recentActionResponses) : undefined,
          relatedOngoingActions: relatedOngoingActions.length > 0 ? Array.from(relatedOngoingActions) : undefined,
        },
      };

      effects.push(refineEffect);
    }
  }

  return effects;
};

