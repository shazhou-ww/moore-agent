import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ActionRequestEffect } from "../agentEffects.ts";

/**
 * 提取所有 ActionRequestEffect
 *
 * 所有有 parameters 但没有 response 的 action requests 都需要执行（可以并发）
 *
 * Effect 只包含 actionRequestId，其他数据在 runEffect 时从 state 中获取
 */
export const extractActionRequestEffects = ({
  actionRequests,
  actionResponses,
  actionParameters,
}: Immutable<AgentState>): ActionRequestEffect[] =>
  Object.keys(actionRequests)
    .filter(
      (actionRequestId) =>
        !(actionRequestId in actionResponses) && // 如果已经有 response，跳过
        actionRequestId in actionParameters // 如果有 parameters，需要执行
    )
    .map(
      (actionRequestId): ActionRequestEffect => ({
        kind: "action-request",
        actionRequestId,
      })
    );
