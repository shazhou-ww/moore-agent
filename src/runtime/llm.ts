import type { Signal, AssistantMessage, AssistantToolCall } from "../types/schema.ts";
import type { CallLLMEffect } from "../types/effects.ts";
import type { EffectInitializer } from "./effects.ts";
import { createId } from "../utils/id.ts";
import { now } from "../utils/time.ts";
import debug from "debug";

const log = debug("agent:llm");

/**
 * LLM 响应类型
 */
export type LLMResponse = {
  content: string;
  toolCalls?: ReadonlyArray<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
};

export type LLMCallFn = (
  prompt: string,
  messageWindow: ReadonlyArray<Signal>,
) => Promise<LLMResponse>;

/**
 * 构建 prompt
 */
const buildPrompt = (messageWindow: ReadonlyArray<Signal>): string => {
  // 这里应该根据 messageWindow 构建 prompt
  // 目前先返回简单的字符串拼接
  return messageWindow.map((msg) => `${msg.kind}: ${msg.content}`).join("\n");
};

/**
 * 运行 LLM 效果
 */
export const runLLMEffect = (
  effect: CallLLMEffect,
  callLLM: LLMCallFn,
): EffectInitializer<Signal> => {
  let canceled = false;
  
  return {
    start: async (dispatch) => {
      if (canceled) {
        return;
      }
      
      try {
        const prompt = effect.prompt || buildPrompt(effect.messageWindow);
        log("Calling LLM with prompt:", prompt);
        
        const response = await callLLM(prompt, effect.messageWindow);
        
        if (canceled) {
          return;
        }
        
        // 处理工具调用
        const toolCalls: ReadonlyArray<AssistantToolCall> | undefined = 
          response.toolCalls?.map((tc) => ({
            id: tc.id,
            name: tc.name,
            input: tc.input,
          }));
        
        const assistantMessage: AssistantMessage = {
          id: createId(),
          kind: "assistant",
          content: response.content,
          toolCalls,
          timestamp: now(),
        };
        
        log("Dispatching assistant message with tool calls:", toolCalls?.length ?? 0);
        dispatch(assistantMessage);
      } catch (error) {
        if (!canceled) {
          log("LLM call failed:", error);
          throw error;
        }
      }
    },
    cancel: () => {
      canceled = true;
    },
  };
};

