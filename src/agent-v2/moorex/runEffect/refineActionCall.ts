import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { RefineActionCallEffect } from "../agentEffects.ts";
import type { AgentSignal, ActionRequestRefinedSignal } from "../agentSignal.ts";
import type { EffectInitializer, RunEffectOptions } from "./types.ts";
import type { Dispatch } from "./effectInitializer.ts";
import { createEffectInitializer } from "./effectInitializer.ts";

/**
 * 解析 JSON Schema 字符串为对象
 */
const parseSchema = (
  schemaString: string,
  actionName: string,
): Record<string, unknown> => {
  try {
    return JSON.parse(schemaString);
  } catch {
    throw new Error(`Invalid parameter schema JSON for actionName: ${actionName}`);
  }
};

/**
 * 构建增强的系统提示词（柯里化最后一个参数）
 */
const buildEnhancedSystemPrompts = (
  baseSystemPrompts: string,
  actionName: string,
  intention: string,
) => (funcName: string): string => {
  return `

## Action Parameter Refinement Task
You need to generate parameters for the following action:

**Action Name:** ${actionName}
**Intention:** ${intention}

**IMPORTANT:** You must return the result by calling the ${funcName} function. The parameters passed to ${funcName} must conform to the provided JSON Schema based on the intention and conversation history.

---

## Main Task System Prompt (for reference)
================================================================================
${baseSystemPrompts}
================================================================================
`;
};

/**
 * 解析 LLM 返回的参数
 */
const parseRefinedParameters = (result: string): string => {
  try {
    const parsed = JSON.parse(result);
    // 如果返回的是对象，提取 parameters 字段
    if (typeof parsed === "object" && parsed !== null && "parameters" in parsed) {
      return typeof parsed.parameters === "string"
        ? parsed.parameters
        : JSON.stringify(parsed.parameters);
    } else {
      // 否则认为整个结果就是 parameters
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    }
  } catch {
    // 如果解析失败，直接使用原始结果
    return result;
  }
};

/**
 * 发送 action request refined 信号
 */
const dispatchActionRequestRefined = (
  actionId: string,
  parameters: string,
  dispatch: Dispatch,
): void => {
  const signal: ActionRequestRefinedSignal = {
    kind: "action-request-refined",
    actionId,
    parameters,
    timestamp: Date.now(),
  };
  dispatch(signal as Immutable<AgentSignal>);
};

/**
 * 创建 RefineActionCallEffect 的初始器
 */
export const createRefineActionCallEffectInitializer = (
  effect: Immutable<RefineActionCallEffect>,
  state: Immutable<AgentState>,
  key: string,
  options: RunEffectOptions,
): EffectInitializer => {
  const {
    behavior: { think },
  } = options;
  
  return createEffectInitializer(
    async (dispatch: Dispatch, isCancelled: () => boolean) => {
      const actionId = effect.actionId;

      // 从 state 获取 action
      const action = state.actions[actionId];
      if (!action) {
        throw new Error(`Action not found for actionId: ${actionId}`);
      }

      // 从 action 获取 name 和 intention
      const { actionName, intention } = action.request;

      // 用 name 获取 schema
      const actionDef = state.actionDefinitions[actionName];
      if (!actionDef) {
        throw new Error(`Action definition not found for actionName: ${actionName}`);
      }
      const parameterSchema = actionDef.schema;
      const outputSchema = parseSchema(parameterSchema, actionName);

      // 创建 getSystemPrompts 函数（柯里化后直接使用）
      const getSystemPrompts = buildEnhancedSystemPrompts(
        state.systemPrompts,
        actionName,
        intention
      );

      // 调用 LLM（think）：根据 intention、schema 和历史消息生成符合 schema 的 parameters
      const result = await think(
        getSystemPrompts,
        Array.from(state.historyMessages),
        outputSchema,
      );

      if (isCancelled()) {
        return;
      }

      // 解析 LLM 返回的参数
      const parameters = parseRefinedParameters(result);

      // 发送 refined 信号
      dispatchActionRequestRefined(actionId, parameters, dispatch);
    },
  );
};

