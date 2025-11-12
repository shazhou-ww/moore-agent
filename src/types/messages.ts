export type BaseMessage = {
  id: string;
  content: string;
  timestamp: number;
};

export type SystemMessage = BaseMessage & {
  kind: "system";
};

export type UserMessage = BaseMessage & {
  kind: "user";
};

export type AssistantToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AssistantMessage = BaseMessage & {
  kind: "assistant";
  toolCalls?: ReadonlyArray<AssistantToolCall>;
};

export type ToolMessage = BaseMessage & {
  kind: "tool";
  callId: string;
};

export type Signal = UserMessage | ToolMessage | AssistantMessage;

