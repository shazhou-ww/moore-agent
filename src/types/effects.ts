import type { MessageWindow, UserMessage, ToolMessage, AssistantMessage } from "./schema.ts";

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
 * LLM streaming chunk 回调
 */
export type LLMChunkCallback = (chunk: string) => void;

/**
 * LLM streaming 完成回调
 */
export type LLMCompleteCallback = (toolCalls?: ReadonlyArray<{
  id: string;
  name: string;
  input: Record<string, unknown>;
}>) => void;

/**
 * LLM 调用函数类型 - 支持 streaming
 */
export type LLMCallFn = (
  prompt: string,
  messageWindow: ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>,
  onChunk: LLMChunkCallback,
  onComplete: LLMCompleteCallback,
) => Promise<void>;

/**
 * 工具调用函数类型
 */
export type ToolCallFn = (
  name: string,
  input: string,
) => Promise<string>;

