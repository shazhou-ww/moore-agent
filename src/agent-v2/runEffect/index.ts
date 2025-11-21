import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { AgentEffect } from "../agentEffects.ts";
import { createReactionEffectInitializer } from "./reaction.ts";
import { createRefineActionCallEffectInitializer } from "./refineActionCall.ts";
import { createReplyToUserEffectInitializer } from "./replyToUser.ts";
import { createActionRequestEffectInitializer } from "./actionRequest.ts";
import type { EffectInitializer, RunEffectOptions } from "./types.ts";

/**
 * 创建 runEffect 函数
 */
export const createRunEffect = (options: RunEffectOptions) => {
  const runEffect = (
    effect: Immutable<AgentEffect>,
    state: Immutable<AgentState>,
    key: string,
  ): EffectInitializer => {
    switch (effect.kind) {
      case "reaction":
        return createReactionEffectInitializer(effect, state, key, options);
      case "refine-action-call":
        return createRefineActionCallEffectInitializer(effect, state, key, options);
      case "reply-to-user":
        return createReplyToUserEffectInitializer(effect, state, key, options);
      case "action-request":
        return createActionRequestEffectInitializer(effect, state, key, options);
      default:
        const _exhaustive: never = effect;
        throw new Error(`Unknown effect kind: ${(_exhaustive as AgentEffect).kind}`);
    }
  };

  return runEffect;
};

// 导出类型
export type { RunEffectOptions } from "./types.ts";
