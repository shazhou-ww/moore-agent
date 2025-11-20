import type { AgentEffect } from "../agentEffects.ts";
import type { AgentSignal, ReactionCompleteSignal } from "../agentSignal.ts";
import type { EffectInitializer, InvokeLLMFn } from "./types.ts";
import { parseJSONResponse } from "./types.ts";
import { now } from "../../utils/time.ts";

/**
 * 创建 ReactionEffect 的初始器
 */
export const createReactionEffectInitializer = (
  effect: Extract<AgentEffect, { kind: "reaction" }>,
  invokeLLM: InvokeLLMFn,
): EffectInitializer => {
  let canceled = false;
  // 从 key 中提取 messageId（例如 "reaction-{messageId}"）
  const messageId = effect.key.replace("reaction-", "");

  return {
    start: async (dispatch: (signal: AgentSignal) => void) => {
      if (canceled) {
        return;
      }

      try {
        const result = await invokeLLM(effect.systemPrompts, effect.messageWindow);

        if (canceled) {
          return;
        }

        // 解析 LLM 返回的决策结果
        // 预期格式：{ type: "reply-to-user" | "adjust-actions" | "noop", ... }
        const decision = parseJSONResponse<ReactionCompleteSignal["decision"]>(
          result,
          "ReactionEffect",
        );

        const signal: ReactionCompleteSignal = {
          kind: "reaction-complete",
          messageId,
          decision,
          timestamp: now(),
        };

        dispatch(signal);
      } catch (error) {
        if (!canceled) {
          console.error("ReactionEffect failed:", error);
          throw error;
        }
      }
    },
    cancel: () => {
      canceled = true;
    },
  };
};

