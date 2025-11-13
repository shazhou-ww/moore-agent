import { z } from "zod";

export const baseMessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  timestamp: z.number(),
});

export const systemMessageSchema = baseMessageSchema.extend({
  kind: z.literal("system"),
});

export const userMessageSchema = baseMessageSchema.extend({
  kind: z.literal("user"),
});

export const assistantToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.string(),
});

export const assistantMessageSchema = baseMessageSchema.extend({
  kind: z.literal("assistant"),
  toolCalls: assistantToolCallSchema.array(),
});

export const toolMessageSchema = baseMessageSchema.extend({
  kind: z.literal("tool"),
  callId: z.string(),
});

export const signalSchema = z.union([
  userMessageSchema,
  toolMessageSchema,
  assistantMessageSchema,
]);

export const agentStateSchema = z.object({
  systemMessage: systemMessageSchema,
  messages: signalSchema.array(),
  lastSentToLLMAt: z.number(),
});

// 导出所有类型
export type BaseMessage = z.infer<typeof baseMessageSchema>;
export type SystemMessage = z.infer<typeof systemMessageSchema>;
export type UserMessage = z.infer<typeof userMessageSchema>;
export type AssistantToolCall = z.infer<typeof assistantToolCallSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type ToolMessage = z.infer<typeof toolMessageSchema>;
export type Signal = z.infer<typeof signalSchema>;
export type AgentState = z.infer<typeof agentStateSchema>;

// 导出辅助类型
export type MessageWindow = ReadonlyArray<Signal>;
export type AgentSnapshot = {
  state: AgentState;
  updatedAt: number;
};


