import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { RefineActionCallEffect } from "../agentEffects.ts";
import type { AgentSignal, ActionRequestRefinedSignal } from "../agentSignal.ts";
import type { EffectInitializer, RunEffectOptions } from "./types.ts";
import type { Dispatch } from "./effectInitializer.ts";
import { createEffectInitializer } from "./effectInitializer.ts";
import { now } from "../../utils/time.ts";

/**
 * 获取并验证 action request 和 parameter schema
 */
const getActionRequestAndSchema = (
  state: Immutable<AgentState>,
  actionRequestId: string,
): {
  request: { actionName: string; intention: string };
  parameterSchema: string;
  outputSchema: Record<string, unknown>;
} => {
  // 从 state 获取 action
  const action = state.actions[actionRequestId];
  if (!action) {
    throw new Error(`Action not found for actionRequestId: ${actionRequestId}`);
  }

  // 从 state.actionDefinitions 中获取 action 的 parameter schema
  const actionDef = state.actionDefinitions[action.request.actionName];
  if (!actionDef) {
    throw new Error(`Action definition not found for actionName: ${action.request.actionName}`);
  }

  const parameterSchema = actionDef.schema;

  // 解析 parameter schema 为 JSON Schema 对象
  let outputSchema: Record<string, unknown>;
  try {
    outputSchema = JSON.parse(parameterSchema);
  } catch {
    throw new Error(`Invalid parameter schema JSON for actionName: ${action.request.actionName}`);
  }

  return { 
    request: { actionName: action.request.actionName, intention: action.request.intention }, 
    parameterSchema, 
    outputSchema 
  };
};

/**
 * 构建增强的系统提示词
 */
const buildEnhancedSystemPrompts = (
  baseSystemPrompts: string,
  actionName: string,
  intention: string,
  parameterSchema: string,
): string => {
  return `${baseSystemPrompts}

## Action Parameter Refinement Task
You need to generate parameters for the following action:

**Action Name:** ${actionName}
**Intention:** ${intention}
**Parameter Schema (JSON Schema):**
${parameterSchema}

Please generate parameters that conform to the provided JSON Schema based on the intention and conversation history. Return the parameters as a valid JSON object that matches the schema.`;
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
  actionRequestId: string,
  parameters: string,
  dispatch: Dispatch,
): void => {
  const signal: ActionRequestRefinedSignal = {
    kind: "action-request-refined",
    actionRequestId,
    parameters,
    timestamp: now(),
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
      const actionRequestId = effect.actionRequestId;

      // 获取并验证 action request 和 schema
      const { request, parameterSchema, outputSchema } = getActionRequestAndSchema(
        state,
        actionRequestId,
      );

      // 构建增强的系统提示词
      const enhancedSystemPrompts = buildEnhancedSystemPrompts(
        state.systemPrompts,
        request.actionName,
        request.intention,
        parameterSchema,
      );

      // 调用 LLM（think）：根据 intention、schema 和历史消息生成符合 schema 的 parameters
      const result = await think(
        enhancedSystemPrompts,
        Array.from(state.historyMessages),
        outputSchema,
      );

      if (isCancelled()) {
        return;
      }

      // 解析 LLM 返回的参数
      const parameters = parseRefinedParameters(result);

      // 发送 refined 信号
      dispatchActionRequestRefined(actionRequestId, parameters, dispatch);
    },
  );
};

