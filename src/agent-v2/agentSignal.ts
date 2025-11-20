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
 * Action Completed Signal Schema - 一个 Action 调用正常完成
 */
export const actionCompletedSignalSchema = z.object({
  kind: z.literal("action-completed"),
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
 * Action Cancelled By User Signal Schema - 用户主动取消一个 Action Request
 * 注意：用户取消的 action 不会从 actionRequests 中移除，以便告知 LLM 这是用户主动取消的
 */
export const actionCancelledByUserSignalSchema = z.object({
  kind: z.literal("action-cancelled-by-user"),
  actionRequestId: z.string(),
  timestamp: z.number(),
});

/**
 * Assistant Chunk Received Signal Schema - 收到 LLM Streaming Chunk
 */
export const assistantChunkReceivedSignalSchema = z.object({
  kind: z.literal("assistant-chunk-received"),
  messageId: z.string(), // 用于关联 chunks 和 complete signal
  chunk: z.string(),
  timestamp: z.number(),
});

/**
 * Assistant Message Complete Signal Schema - LLM Streaming 结束（用于 reply）
 */
export const assistantMessageCompleteSignalSchema = z.object({
  kind: z.literal("assistant-message-complete"),
  messageId: z.string(),
  timestamp: z.number(),
});

/**
 * Reaction Complete Signal Schema - Reaction Effect 完成
 * Reaction 是基于最近的输入（user message 或 action responses）让 LLM 做下一步动作的规划
 */
export const reactionCompleteSignalSchema = z.object({
  kind: z.literal("reaction-complete"),
  messageId: z.string(), // 关联到 ReactionEffect 的 messageId
  // 决策结果：取消哪些、新开哪些、或回复
  decisions: z.object({
    cancelActions: z.array(z.string()), // actionRequestIds 需要取消的
    newActions: z.array(z.object({
      actionName: z.string(),
      initialIntent: z.string(), // 初始意图，用于后续 RefineActionCallEffect
    })),
    shouldReply: z.boolean(), // 是否直接回复用户
  }),
  timestamp: z.number(),
});

/**
 * AgentSignal Schema - Agent 接收到的信号
 */
export const agentSignalSchema = z.union([
  userMessageReceivedSignalSchema,
  actionCompletedSignalSchema,
  actionRequestedSignalSchema,
  actionCancelledByUserSignalSchema,
  assistantChunkReceivedSignalSchema,
  assistantMessageCompleteSignalSchema,
  reactionCompleteSignalSchema,
]);

// ==================== 类型导出 ====================

/**
 * User Message Received Signal - 用户发了一条消息
 */
export type UserMessageReceivedSignal = z.infer<
  typeof userMessageReceivedSignalSchema
>;

/**
 * Action Completed Signal - 一个 Action 调用正常完成
 */
export type ActionCompletedSignal = z.infer<
  typeof actionCompletedSignalSchema
>;

/**
 * Action Requested Signal - Agent 发起一个 Action Request
 */
export type ActionRequestedSignal = z.infer<
  typeof actionRequestedSignalSchema
>;

/**
 * Action Cancelled By User Signal - 用户主动取消一个 Action Request
 */
export type ActionCancelledByUserSignal = z.infer<
  typeof actionCancelledByUserSignalSchema
>;

/**
 * Assistant Chunk Received Signal - 收到 LLM Streaming Chunk
 */
export type AssistantChunkReceivedSignal = z.infer<
  typeof assistantChunkReceivedSignalSchema
>;

/**
 * Assistant Message Complete Signal - LLM Streaming 结束（用于 reply）
 */
export type AssistantMessageCompleteSignal = z.infer<
  typeof assistantMessageCompleteSignalSchema
>;

/**
 * Reaction Complete Signal - Reaction Effect 完成
 */
export type ReactionCompleteSignal = z.infer<
  typeof reactionCompleteSignalSchema
>;

/**
 * AgentSignal - Agent 接收到的信号
 */
export type AgentSignal = z.infer<typeof agentSignalSchema>;

