import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { RefineActionCallEffect } from "../agentEffects.ts";

/**
 * 提取所有 RefineActionCallEffect
 *
 * 所有没有 parameters 的 action requests 都需要细化（可以并发）
 *
 * Effect 只包含 actionRequestId，其他数据在 runEffect 时从 state 中获取
 */
export const extractRefineActionCallEffects = (
  state: Immutable<AgentState>
): RefineActionCallEffect[] =>
  Object.entries(state.actionRequests)
    .filter(
      ([actionRequestId, request]) =>
        !(actionRequestId in state.actionResponses) && // 如果已经有 response，跳过
        !(actionRequestId in state.actionParameters) && // 如果没有 parameters，需要细化
        state.actions[request.actionName] // 如果 action 定义不存在，跳过
    )
    .map(
      ([actionRequestId]): RefineActionCallEffect => ({
        kind: "refine-action-call",
        actionRequestId,
      })
    );
