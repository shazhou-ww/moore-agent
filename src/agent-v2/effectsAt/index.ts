import type { FrozenJson } from "@hstore/core";
import type { AgentState } from "../agentState.ts";
import type { AgentEffect } from "../agentEffects.ts";
import { extractReplyToUserEffects } from "./replyToUser.ts";
import { extractReactionEffect } from "./reaction.ts";
import { extractRefineActionCallEffects } from "./refineActionCall.ts";
import { extractActionRequestEffects } from "./actionRequest.ts";

/**
 * 根据状态推导需要执行的 effects
 * 
 * 所有 effects 都可以并发执行，函数会返回当前状态下所有需要执行的 effects：
 * 
 * 1. ReplyToUserEffect - 所有 replies 中的 context 都需要生成回复（可以并发）
 * 2. ReactionEffect - 如果有新的用户消息或新的 action responses，且没有待处理的 ReplyToUserEffect，需要做反应
 * 3. RefineActionCallEffect - 所有没有 parameters 的 action requests 都需要细化（可以并发）
 * 4. ActionRequestEffect - 所有有 parameters 但没有 response 的 action requests 都需要执行（可以并发）
 */
export const effectsAt = (state: FrozenJson<AgentState>): AgentEffect[] => {
  const reactionEffect = extractReactionEffect(state);
  return [
    ...extractReplyToUserEffects(state),
    ...(reactionEffect ? [reactionEffect] : []),
    ...extractRefineActionCallEffects(state),
    ...extractActionRequestEffects(state),
  ];
};

