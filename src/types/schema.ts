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
  input: z.record(z.unknown()),
});

export const assistantMessageSchema = baseMessageSchema.extend({
  kind: z.literal("assistant"),
  toolCalls: assistantToolCallSchema.array().optional(),
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
  messages: z.array(z.union([userMessageSchema, toolMessageSchema, assistantMessageSchema])),
  lastSentToLLMAt: z.number(),
});

export const agentSnapshotSchema = z.object({
  state: agentStateSchema,
  updatedAt: z.number(),
});

export type AgentStateInput = z.input<typeof agentStateSchema>;

