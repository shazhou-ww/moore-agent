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
  const {
    invokeLLM,
    streamLLM,
    callAction,
    getActionParameters,
    getSystemPrompts,
    sendUserMessageChunk,
    completeUserMessage,
  } = options;

  const runEffect = (
    effect: Immutable<AgentEffect>,
    state: Immutable<AgentState>,
  ): EffectInitializer => {
    if (effect.kind === "reaction") {
      return createReactionEffectInitializer(effect as Immutable<import("../agentEffects.ts").ReactionEffect>, invokeLLM, getSystemPrompts);
    }

    if (effect.kind === "refine-action-call") {
      return createRefineActionCallEffectInitializer(effect as Immutable<import("../agentEffects.ts").RefineActionCallEffect>, invokeLLM);
    }

    if (effect.kind === "reply-to-user") {
      return createReplyToUserEffectInitializer(
        effect as Immutable<import("../agentEffects.ts").ReplyToUserEffect>,
        streamLLM,
        sendUserMessageChunk,
        completeUserMessage,
      );
    }

    if (effect.kind === "action-request") {
      return createActionRequestEffectInitializer(effect as Immutable<import("../agentEffects.ts").ActionRequestEffect>, callAction, getActionParameters);
    }

    // Exhaustiveness check
    const _exhaustive: never = effect;
    throw new Error(`Unknown effect kind: ${(_exhaustive as AgentEffect).kind}`);
  };

  return runEffect;
};

// 导出类型
export type { RunEffectOptions } from "./types.ts";
