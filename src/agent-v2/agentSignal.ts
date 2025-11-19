import { z } from "zod";

/**
 * User Message Received Signal Schema - 用户发了一条消息
 */
export const userMessageReceivedSignalSchema = z.object({
  kind: z.literal("user-message-received"),
  messageId: z.string(),
  content: z.string(),
  timestamp: z.number(),
});

/**
 * Action Responded Signal Schema - 一个 Action 调用返回（成功或失败）
 */
export const actionRespondedSignalSchema = z.object({
  kind: z.literal("action-responded"),
  actionRequestId: z.string(),
  result: z.string(), // 结果字符串（成功或失败信息）
  timestamp: z.number(),
});

/**
 * Action Requested Signal Schema - Agent 发起一个 Action Request
 */
export const actionRequestedSignalSchema = z.object({
  kind: z.literal("action-requested"),
  actionRequestId: z.string(),
  actionName: z.string(),
  parameters: z.string(), // JSON 字符串
  intention: z.string(), // 描述 action 的目的
  timestamp: z.number(),
});

/**
 * Action Cancelled Signal Schema - Agent 取消一个 Action Request
 */
export const actionCancelledSignalSchema = z.object({
  kind: z.literal("action-cancelled"),
  actionRequestId: z.string(),
  timestamp: z.number(),
});

/**
 * Assistant Chunk Received Signal Schema - 收到 LLM Streaming Chunk
 */
export const assistantChunkReceivedSignalSchema = z.object({
  kind: z.literal("assistant-chunk-received"),
  chunk: z.string(),
  timestamp: z.number(),
});

/**
 * Assistant Message Complete Signal Schema - LLM Streaming 结束
 */
export const assistantMessageCompleteSignalSchema = z.object({
  kind: z.literal("assistant-message-complete"),
  messageId: z.string(),
  timestamp: z.number(),
});

/**
 * AgentSignal Schema - Agent 接收到的信号
 */
export const agentSignalSchema = z.union([
  userMessageReceivedSignalSchema,
  actionRespondedSignalSchema,
  actionRequestedSignalSchema,
  actionCancelledSignalSchema,
  assistantChunkReceivedSignalSchema,
  assistantMessageCompleteSignalSchema,
]);

// ==================== 类型导出 ====================

/**
 * User Message Received Signal - 用户发了一条消息
 */
export type UserMessageReceivedSignal = z.infer<
  typeof userMessageReceivedSignalSchema
>;

/**
 * Action Responded Signal - 一个 Action 调用返回（成功或失败）
 */
export type ActionRespondedSignal = z.infer<
  typeof actionRespondedSignalSchema
>;

/**
 * Action Requested Signal - Agent 发起一个 Action Request
 */
export type ActionRequestedSignal = z.infer<
  typeof actionRequestedSignalSchema
>;

/**
 * Action Cancelled Signal - Agent 取消一个 Action Request
 */
export type ActionCancelledSignal = z.infer<
  typeof actionCancelledSignalSchema
>;

/**
 * Assistant Chunk Received Signal - 收到 LLM Streaming Chunk
 */
export type AssistantChunkReceivedSignal = z.infer<
  typeof assistantChunkReceivedSignalSchema
>;

/**
 * Assistant Message Complete Signal - LLM Streaming 结束
 */
export type AssistantMessageCompleteSignal = z.infer<
  typeof assistantMessageCompleteSignalSchema
>;

/**
 * AgentSignal - Agent 接收到的信号
 */
export type AgentSignal = z.infer<typeof agentSignalSchema>;

