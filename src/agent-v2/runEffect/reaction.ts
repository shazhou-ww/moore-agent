import type { AgentEffect } from "../agentEffects.ts";
import type { AgentSignal, ReactionCompleteSignal } from "../agentSignal.ts";
import type { EffectInitializer, InvokeLLMFn, GetSystemPromptsFn } from "./types.ts";
import { parseJSONResponse } from "./types.ts";
import { now } from "../../utils/time.ts";

/**
 * 创建 ReactionEffect 的初始器
 */
export const createReactionEffectInitializer = (
  effect: Extract<AgentEffect, { kind: "reaction" }>,
  invokeLLM: InvokeLLMFn,
  getSystemPrompts: GetSystemPromptsFn,
): EffectInitializer => {
  let canceled = false;
  // 从 key 中提取 hash（例如 "reaction-{hash}"）
  const reactionHash = effect.key.replace("reaction-", "");

  return {
    start: async (dispatch: (signal: AgentSignal) => void) => {
      if (canceled) {
        return;
      }

      try {
        // 从 state 获取 systemPrompts
        const systemPrompts = getSystemPrompts();
        
        // 使用 newUserMessages 作为 messageWindow（新的用户输入）
        // 注意：根据新的设计，messageWindow 不必要，但 LLM 调用需要它
        // 这里使用 newUserMessages 作为基础消息窗口
        const messageWindow = effect.newUserMessages;
        
        const result = await invokeLLM(systemPrompts, messageWindow);

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
          messageId: reactionHash, // 使用 reaction hash 作为 messageId
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

