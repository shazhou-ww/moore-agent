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

// Assistant chunk signal - 用于接收 streaming chunk
export const assistantChunkSignalSchema = z.object({
  kind: z.literal("assistant-chunk"),
  messageId: z.string(),
  chunk: z.string(),
  timestamp: z.number(),
});

// Assistant message complete signal - 用于标记 streaming 完成
export const assistantMessageCompleteSignalSchema = z.object({
  kind: z.literal("assistant-complete"),
  messageId: z.string(),
  toolCalls: assistantToolCallSchema.array(),
  timestamp: z.number(),
});

export const signalSchema = z.union([
  userMessageSchema,
  toolMessageSchema,
  assistantChunkSignalSchema,
  assistantMessageCompleteSignalSchema,
]);

// Partial message chunks - 存储在 state 中
export const partialMessageSchema = z.object({
  messageId: z.string(),
  chunks: z.array(z.string()),
});

export const agentStateSchema = z.object({
  systemMessage: systemMessageSchema,
  messages: z.union([
    userMessageSchema,
    toolMessageSchema,
    assistantMessageSchema,
  ]).array(),
  partialMessage: partialMessageSchema.nullable(),
  lastSentToLLMAt: z.number(),
});

// 导出所有类型
export type BaseMessage = z.infer<typeof baseMessageSchema>;
export type SystemMessage = z.infer<typeof systemMessageSchema>;
export type UserMessage = z.infer<typeof userMessageSchema>;
export type AssistantToolCall = z.infer<typeof assistantToolCallSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type ToolMessage = z.infer<typeof toolMessageSchema>;
export type AssistantChunkSignal = z.infer<typeof assistantChunkSignalSchema>;
export type AssistantMessageCompleteSignal = z.infer<typeof assistantMessageCompleteSignalSchema>;
export type Signal = z.infer<typeof signalSchema>;
export type PartialMessage = z.infer<typeof partialMessageSchema>;
export type AgentState = z.infer<typeof agentStateSchema>;

// 导出辅助类型
export type MessageWindow = ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>;
export type AgentSnapshot = {
  state: AgentState;
  updatedAt: number;
};


