import type { MessageWindow, Signal } from "./schema.ts";

export type CallLLMEffect = {
  key: `llm-${string}`;
  kind: "call-llm";
  prompt: string;
  messageWindow: MessageWindow;
};

export type CallToolEffect = {
  key: `tool-${string}-${string}`;
  kind: "call-tool";
  messageId: string;
  call: {
    id: string;
    name: string;
    input: string;
  };
};

export type Effect = CallLLMEffect | CallToolEffect;

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

/**
 * LLM 调用函数类型
 */
export type LLMCallFn = (
  prompt: string,
  messageWindow: ReadonlyArray<Signal>,
) => Promise<LLMResponse>;

/**
 * 工具调用函数类型
 */
export type ToolCallFn = (
  name: string,
  input: string,
) => Promise<string>;

