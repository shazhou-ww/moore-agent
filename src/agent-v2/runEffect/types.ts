import type { Immutable } from "mutative";
import type { HistoryMessage } from "../agentState.ts";
import type { AgentSignal } from "../agentSignal.ts";

/**
 * Effect 初始器类型（与 moorex 的 EffectInitializer 对应）
 */
export type EffectInitializer = {
  start: (dispatch: (signal: Immutable<AgentSignal>) => void) => Promise<void>;
  cancel: () => void;
};

/**
 * LLM 工具函数定义
 */
export type LLMTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
};

/**
 * 非流式调用大模型函数类型（think）
 * 用于让 LLM 思考特定问题，返回符合指定 schema 的 JSON 字符串
 */
export type ThinkFn = (
  systemPrompts: string,
  messageWindow: HistoryMessage[],
  outputSchema: Record<string, unknown>, // JSON Schema，限定输出格式
) => Promise<string>; // 返回符合 outputSchema 的 JSON 字符串

/**
 * 流式调用大模型函数类型（speak）
 * 用于让 LLM 解释说明，不限回答格式，返回 chunk 流
 */
export type SpeakFn = (
  systemPrompts: string,
  messageWindow: HistoryMessage[],
) => Promise<AsyncIterator<string>>;

/**
 * 调用 Action 函数类型（act）
 */
export type ActFn = (
  actionName: string,
  parameters: string, // JSON 字符串
) => Promise<string>; // 返回结果字符串

/**
 * 获取 Action Parameter Schema 函数类型
 * 用于从 state 中获取对应 actionName 的 parameter schema（JSON Schema 字符串）
 */
export type GetActionParameterSchemaFn = (
  actionName: string,
) => string | undefined; // 返回 JSON Schema 字符串或 undefined

/**
 * 发送用户消息块函数类型
 */
export type SendUserMessageChunkFn = (messageId: string, chunk: string) => void;

/**
 * 完成用户消息函数类型
 */
export type CompleteUserMessageFn = (messageId: string) => void;

/**
 * 获取 System Prompts 函数类型
 * 用于从 state 或其他地方获取 system prompts
 */
export type GetSystemPromptsFn = () => string;

/**
 * RunEffect 选项
 */
export type RunEffectOptions = {
  think: ThinkFn;
  speak: SpeakFn;
  act: ActFn;
  getActionParameterSchema: GetActionParameterSchemaFn; // 用于获取 action parameter schema
  getSystemPrompts: GetSystemPromptsFn; // 用于获取 system prompts
  sendUserMessageChunk: SendUserMessageChunkFn;
  completeUserMessage: CompleteUserMessageFn;
  // Reaction 相关配置
  actions: Record<string, string>; // Record<actionName, description> - 所有可用的 action 类型
  reactionInitialHistoryRounds: number; // 初始的上下文消息轮次 n
  reactionAdditionalHistoryRounds: number; // 每次追加的消息轮次 m
};

/**
 * 解析 JSON 响应（带错误处理）
 */
export const parseJSONResponse = <T>(jsonString: string, context: string): T => {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response in ${context}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

