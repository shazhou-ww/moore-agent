import type { MessageWindow } from "./state.ts";

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
    input: Record<string, unknown>;
  };
};

export type Effect = CallLLMEffect | CallToolEffect;

