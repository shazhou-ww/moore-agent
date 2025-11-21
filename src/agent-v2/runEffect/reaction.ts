import { v4 } from "uuid";
import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ReactionEffect } from "../agentEffects.ts";
import type { AgentSignal, ReactionCompleteSignal } from "../agentSignal.ts";
import type { EffectInitializer, RunEffectOptions } from "./types.ts";
import type { Dispatch } from "./effectInitializer.ts";
import { createEffectInitializer } from "./effectInitializer.ts";
import { parseJSONResponse } from "./types.ts";
import { now } from "../../utils/time.ts";

/**
 * 创建 ReactionEffect 的初始器
 */
export const createReactionEffectInitializer = (
  effect: Immutable<ReactionEffect>,
  state: Immutable<AgentState>,
  key: string,
  options: RunEffectOptions,
): EffectInitializer => {
  const { invokeLLM, getSystemPrompts } = options;
  
  return createEffectInitializer(
    async (dispatch: Dispatch, isCancelled: () => boolean) => {
      if (isCancelled()) {
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
        
        const result = await invokeLLM("reaction", systemPrompts, messageWindow);

        if (isCancelled()) {
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
          messageId: v4(),
          decision,
          timestamp: now(),
        };

        dispatch(signal as Immutable<AgentSignal>);
      } catch (error) {
        if (!isCancelled()) {
          console.error("ReactionEffect failed:", error);
          throw error;
        }
      }
    },
  );
};

