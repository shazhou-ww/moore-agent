import type { AssistantMessage, SystemMessage, ToolMessage, UserMessage } from "./messages.ts";

export type Signal = UserMessage | ToolMessage | AssistantMessage;

export type AgentState = {
  systemMessage: SystemMessage;
  messages: ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>;
  lastSentToLLMAt: number;
};

export type AgentSnapshot = {
  state: AgentState;
  updatedAt: number;
};

export type MessageWindow = ReadonlyArray<Signal>;

