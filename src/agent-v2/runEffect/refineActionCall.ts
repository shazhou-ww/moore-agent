import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { RefineActionCallEffect } from "../agentEffects.ts";
import type { AgentSignal, ActionRequestRefinedSignal } from "../agentSignal.ts";
import type {
  EffectInitializer,
  InvokeLLMFn,
  GetActionParameterSchemaFn,
} from "./types.ts";
import { now } from "../../utils/time.ts";

/**
 * 创建 RefineActionCallEffect 的初始器
 */
export const createRefineActionCallEffectInitializer = (
  effect: Immutable<RefineActionCallEffect>,
  state: Immutable<AgentState>,
  invokeLLM: InvokeLLMFn,
  getActionParameterSchema: GetActionParameterSchemaFn,
): EffectInitializer => {
  let canceled = false;
  // actionRequestId 从 effect 中获取
  const actionRequestId = effect.actionRequestId;

  return {
    start: async (dispatch: (signal: Immutable<AgentSignal>) => void) => {
      if (canceled) {
        return;
      }

      try {
        // 从 state 获取 action request
        const request = state.actionRequests[actionRequestId];
        if (!request) {
          throw new Error(`Action request not found for actionRequestId: ${actionRequestId}`);
        }

        // 获取 action 的 parameter schema
        const parameterSchema = getActionParameterSchema(request.actionName);
        if (!parameterSchema) {
          throw new Error(
            `Action parameter schema not found for actionName: ${request.actionName}`,
          );
        }

        // 从 state 获取 systemPrompts
        const baseSystemPrompts = state.systemPrompts;

        // 构建包含 action 信息的 system prompts
        // 将 parameter schema 和 intention 添加到 system prompts 中，以便 LLM 生成符合 schema 的 parameters
        const enhancedSystemPrompts = `${baseSystemPrompts}

## Action Parameter Refinement Task
You need to generate parameters for the following action:

**Action Name:** ${request.actionName}
**Intention:** ${request.intention}
**Parameter Schema (JSON Schema):**
${parameterSchema}

Please generate parameters that conform to the provided JSON Schema based on the intention and conversation history. Return the parameters as a valid JSON object that matches the schema.`;

        // 从 state 获取历史消息窗口
        const messageWindow = Array.from(state.historyMessages);

        // 使用 'refine-action' scene 调用 LLM，传入 intention、parameter schema 和历史消息
        // LLM 需要根据 intention、schema 和历史消息生成符合 schema 的 parameters
        const result = await invokeLLM("refine-action", enhancedSystemPrompts, messageWindow);

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

