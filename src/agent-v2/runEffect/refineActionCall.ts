import type { Immutable } from "mutative";
import type { AgentEffect } from "../agentEffects.ts";
import type { AgentSignal, ActionRequestRefinedSignal } from "../agentSignal.ts";
import type { EffectInitializer, InvokeLLMFn } from "./types.ts";
import { now } from "../../utils/time.ts";

/**
 * 创建 RefineActionCallEffect 的初始器
 */
export const createRefineActionCallEffectInitializer = (
  effect: Immutable<Extract<AgentEffect, { kind: "refine-action-call" }>>,
  invokeLLM: InvokeLLMFn,
): EffectInitializer => {
  let canceled = false;
  // 从 key 中提取 actionRequestId（例如 "refine-action-{actionRequestId}"）
  const actionRequestId = effect.key.replace("refine-action-", "");

  return {
    start: async (dispatch: (signal: Immutable<AgentSignal>) => void) => {
      if (canceled) {
        return;
      }

      try {
        const result = await invokeLLM(effect.systemPrompts, Array.from(effect.messageWindow));

        if (canceled) {
          return;
        }

        // 解析 LLM 返回的参数（JSON 字符串）
        // 预期格式：{ parameters: string } 或直接是 JSON 字符串
        let parameters: string;
        try {
          const parsed = JSON.parse(result);
          // 如果返回的是对象，提取 parameters 字段
          if (typeof parsed === "object" && parsed !== null && "parameters" in parsed) {
            parameters =
              typeof parsed.parameters === "string"
                ? parsed.parameters
                : JSON.stringify(parsed.parameters);
          } else {
            // 否则认为整个结果就是 parameters
            parameters = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
          }
        } catch {
          // 如果解析失败，直接使用原始结果
          parameters = result;
        }

        const signal: ActionRequestRefinedSignal = {
          kind: "action-request-refined",
          actionRequestId,
          parameters,
          timestamp: now(),
        };

        dispatch(signal as Immutable<AgentSignal>);
      } catch (error) {
        if (!canceled) {
          console.error("RefineActionCallEffect failed:", error);
          throw error;
        }
      }
    },
    cancel: () => {
      canceled = true;
    },
  };
};

