import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ReplyToUserEffect } from "../agentEffects.ts";

/**
 * 提取所有 ReplyToUserEffect
 * 
 * 如果 replies 中有 context，说明 reaction 已经决定要回复用户，需要生成 streaming 回复
 * 所有 replies 中的 context 都需要生成回复（可以并发）
 * 
 * Effect 只包含 messageId，其他数据在 runEffect 时从 state.replies[messageId] 和 state 中获取
 */
export const extractReplyToUserEffects = ({
  replies,
}: Immutable<AgentState>): ReplyToUserEffect[] =>
  Object.keys(replies).map(
    (messageId): ReplyToUserEffect => ({
      kind: "reply-to-user",
      messageId, // messageId 对应 state.replies 的 key
    })
  );

