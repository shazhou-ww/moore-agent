import type { HistoryMessage } from "../agentState.ts";
import type { AgentSignal } from "../agentSignal.ts";

/**
 * Effect 初始器类型（与 moorex 的 EffectInitializer 对应）
 */
export type EffectInitializer = {
  start: (dispatch: (signal: AgentSignal) => void) => Promise<void>;
  cancel: () => void;
};

/**
 * 非流式调用大模型函数类型
 * 返回结构化的决策结果（根据不同的 Effect 类型，返回不同的结果）
 */
export type InvokeLLMFn = (
  systemPrompts: string,
  messageWindow: HistoryMessage[],
) => Promise<string>; // 返回 JSON 字符串

/**
 * 流式调用大模型函数类型
 */
export type StreamLLMFn = (
  systemPrompts: string,
  messageWindow: HistoryMessage[],
  onChunk: (chunk: string) => void,
) => Promise<void>;

/**
 * 调用 Action 函数类型
 */
export type CallActionFn = (
  actionName: string,
  parameters: string, // JSON 字符串
) => Promise<string>; // 返回结果字符串

/**
 * 获取 Action Parameters 函数类型
 * 用于从 state 中获取对应 actionRequestId 的 parameters
 */
export type GetActionParametersFn = (
  actionRequestId: string,
) => string | undefined; // 返回 JSON 字符串或 undefined

/**
 * 发送用户消息块函数类型
 */
export type SendUserMessageChunkFn = (chunk: string) => void;

/**
 * 完成用户消息函数类型
 */
export type CompleteUserMessageFn = () => void;

/**
 * RunEffect 选项
 */
export type RunEffectOptions = {
  invokeLLM: InvokeLLMFn;
  streamLLM: StreamLLMFn;
  callAction: CallActionFn;
  getActionParameters: GetActionParametersFn; // 用于获取 action parameters
  sendUserMessageChunk: SendUserMessageChunkFn;
  completeUserMessage: CompleteUserMessageFn;
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

