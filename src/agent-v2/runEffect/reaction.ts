import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { AgentEffect } from "../agentEffects.ts";
import type { AgentSignal, ReactionCompleteSignal } from "../agentSignal.ts";
import type { EffectInitializer, InvokeLLMFn, GetSystemPromptsFn } from "./types.ts";
import { parseJSONResponse } from "./types.ts";
import { now } from "../../utils/time.ts";

/**
 * 创建 ReactionEffect 的初始器
 */
export const createReactionEffectInitializer = (
  effect: Immutable<Extract<AgentEffect, { kind: "reaction" }>>,
  state: Immutable<AgentState>,
  invokeLLM: InvokeLLMFn,
  getSystemPrompts: GetSystemPromptsFn,
): EffectInitializer => {
  let canceled = false;
  // 使用 timestamp 生成 reaction hash（用于 signal 中的 messageId）
  const reactionHash = `reaction-${effect.timestamp}`;

  return {
    start: async (dispatch: (signal: Immutable<AgentSignal>) => void) => {
      if (canceled) {
        return;
      }

      try {
        // 从 state 获取 systemPrompts
        const systemPrompts = getSystemPrompts();
        
        // 从 state 获取新的用户消息（timestamp > lastReactionTimestamp）
        const newUserMessages = state.historyMessages.filter(
          (msg) => msg.type === "user" && msg.timestamp > state.lastReactionTimestamp,
        );
        
        // 使用 newUserMessages 作为 messageWindow（新的用户输入）
        const messageWindow = Array.from(newUserMessages);
        
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

        dispatch(signal as Immutable<AgentSignal>);
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

