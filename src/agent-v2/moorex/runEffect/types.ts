import type { Immutable } from "mutative";
import type { HistoryMessage, Action } from "../agentState.ts";
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
  getSystemPrompts: (funcName: string) => string,
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
  relatedActions: Record<string, Action>, // 相关的 actions，key 是 actionId
  sentContent: string, // 已发送的内容，用于接续回复，如果没有则传空字符串
) => Promise<AsyncGenerator<string>>;

/**
 * 调用 Action 函数类型（act）
 */
export type ActFn = (
  actionId: string,
  actionName: string,
  parameters: string, // JSON 字符串
) => Promise<string>; // 返回结果字符串

/**
 * RunEffect 选项
 */
export type RunEffectOptions = {
  behavior: {
    think: ThinkFn;
    speak: SpeakFn;
    act: ActFn;
  };
  options: {
    reaction: {
      initialHistoryCount: number; // 初始的上下文消息条数 n
      additionalHistoryCount: number; // 每次追加的消息条数 m
    };
  };
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

