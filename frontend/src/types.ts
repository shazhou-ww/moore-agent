import type { FrozenJson } from "@hstore/core";

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
  input: string;
};

export type AssistantMessage = BaseMessage & {
  kind: "assistant";
  toolCalls: AssistantToolCall[];
};

export type ToolMessage = BaseMessage & {
  kind: "tool";
  callId: string;
};

export type Signal = UserMessage | ToolMessage | AssistantMessage;

export type AgentState = {
  systemMessage: SystemMessage;
  messages: Signal[];
  lastSentToLLMAt: number;
};

export type AgentEvent =
  | { type: "signal-received"; signal: Signal; effectCount: number }
  | { type: "state-updated"; state: FrozenJson<AgentState>; effectCount: number }
  | { type: "effect-started"; effect: any; effectCount: number }
  | { type: "effect-completed"; effect: any; effectCount: number }
  | { type: "effect-canceled"; effect: any; effectCount: number }
  | { type: "effect-failed"; effect: any; error: unknown; effectCount: number };

