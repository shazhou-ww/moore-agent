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
  const {
    invokeLLM,
    streamLLM,
    callAction,
    getActionParameters,
    sendUserMessageChunk,
    completeUserMessage,
  } = options;

  const runEffect = (effect: AgentEffect): EffectInitializer => {
    if (effect.kind === "reaction") {
      return createReactionEffectInitializer(effect, invokeLLM);
    }

    if (effect.kind === "refine-action-call") {
      return createRefineActionCallEffectInitializer(effect, invokeLLM);
    }

    if (effect.kind === "reply-to-user") {
      return createReplyToUserEffectInitializer(
        effect,
        streamLLM,
        sendUserMessageChunk,
        completeUserMessage,
      );
    }

    if (effect.kind === "action-request") {
      return createActionRequestEffectInitializer(effect, callAction, getActionParameters);
    }

    // Exhaustiveness check
    const _exhaustive: never = effect;
    throw new Error(`Unknown effect kind: ${(_exhaustive as AgentEffect).kind}`);
  };

  return runEffect;
};

// 导出类型
export type { RunEffectOptions } from "./types.ts";
