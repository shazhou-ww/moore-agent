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
  actionId: z.string(),
  result: z.string(), // 结果字符串（成功或失败信息）
  timestamp: z.number(),
});

/**
 * Action Request Refined Signal Schema - Action Request 的参数被细化完成
 */
export const actionRequestRefinedSignalSchema = z.object({
  kind: z.literal("action-request-refined"),
  actionId: z.string(),
  parameters: z.string(), // JSON 字符串
  timestamp: z.number(),
});

/**
 * Action Cancelled By User Signal Schema - 用户主动取消一个 Action Request
 * 注意：用户取消的 action 不会从 actions 中移除，只是更新 response 为 cancelled 类型，以便告知 LLM 这是用户主动取消的
 */
export const actionCancelledByUserSignalSchema = z.object({
  kind: z.literal("action-cancelled-by-user"),
  actionId: z.string(),
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
 * Reply To User Decision Schema - 回复用户的决策
 * 包含相关的 action ids
 */
export const replyToUserDecisionSchema = z.object({
  type: z.literal("reply-to-user"),
  relatedActionIds: z.array(z.string()), // 相关的 action request ids（已排序）
});

/**
 * Adjust Actions Decision Schema - 调整 actions 的决策
 * 取消哪些、新开哪些
 */
export const adjustActionsDecisionSchema = z.object({
  type: z.literal("adjust-actions"),
  cancelActions: z.array(z.string()), // actionIds 需要取消的
  newActions: z.array(z.object({
    actionName: z.string(),
    initialIntent: z.string(), // 初始意图，用于后续 RefineActionCallEffect
  })),
});

/**
 * Noop Decision Schema - 无需操作的决策
 * 什么都不需要调整
 */
export const noopDecisionSchema = z.object({
  type: z.literal("noop"),
});

/**
 * Reaction Decision Schema - Reaction 的决策结果
 * 分成两个互斥类型（不包含 noop，noop 用 adjust-actions 带空集代替）
 */
export const reactionDecisionSchema = z.discriminatedUnion("type", [
  replyToUserDecisionSchema,
  adjustActionsDecisionSchema,
]);

/**
 * Reply To User Decision Schema Ext - 带 messageId 的回复用户决策
 */
export const replyToUserDecisionExtSchema = replyToUserDecisionSchema.extend({
  messageId: z.string(), // 注入生成的 messageId
});

/**
 * Adjust Actions Decision Schema Ext - 带 actionId 的调整 actions 决策
 */
export const adjustActionsDecisionExtSchema = z.object({
  type: z.literal("adjust-actions"),
  cancelActions: z.array(z.string()), // actionIds 需要取消的
  newActions: z.array(z.object({
    actionId: z.string(), // 注入生成的 actionId
    actionName: z.string(),
    initialIntent: z.string(), // 初始意图，用于后续 RefineActionCallEffect
  })),
});

/**
 * Reaction Decision Schema Ext - 带注入 id 的决策结果
 * 不包含 noop（noop 用 adjust-actions 带空集代替）
 */
export const reactionDecisionExtSchema = z.discriminatedUnion("type", [
  replyToUserDecisionExtSchema,
  adjustActionsDecisionExtSchema,
]);

/**
 * Reaction Complete Signal Schema - Reaction Effect 完成
 * Reaction 是基于最近的输入（user message 或 action responses）让 LLM 做下一步动作的规划
 * Reaction 是 non-streaming 的，直接返回决策结果
 */
export const reactionCompleteSignalSchema = z.object({
  kind: z.literal("reaction-complete"),
  decision: reactionDecisionExtSchema,
  timestamp: z.number(),
});

/**
 * AgentSignal Schema - Agent 接收到的信号
 */
export const agentSignalSchema = z.union([
  userMessageReceivedSignalSchema,
  actionCompletedSignalSchema,
  actionRequestRefinedSignalSchema,
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
 * Action Request Refined Signal - Action Request 的参数被细化完成
 */
export type ActionRequestRefinedSignal = z.infer<
  typeof actionRequestRefinedSignalSchema
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
 * Reaction Decision - Reaction 的决策结果
 */
export type ReactionDecision = z.infer<typeof reactionDecisionSchema>;

/**
 * Reaction Decision Ext - 带注入 id 的决策结果
 */
export type ReactionDecisionExt = z.infer<typeof reactionDecisionExtSchema>;

/**
 * Reply To User Decision - 回复用户的决策
 */
export type ReplyToUserDecision = z.infer<typeof replyToUserDecisionSchema>;

/**
 * Reply To User Decision Ext - 带 messageId 的回复用户决策
 */
export type ReplyToUserDecisionExt = z.infer<typeof replyToUserDecisionExtSchema>;

/**
 * Adjust Actions Decision - 调整 actions 的决策
 */
export type AdjustActionsDecision = z.infer<typeof adjustActionsDecisionSchema>;

/**
 * Adjust Actions Decision Ext - 带 actionId 的调整 actions 决策
 */
export type AdjustActionsDecisionExt = z.infer<typeof adjustActionsDecisionExtSchema>;

/**
 * Noop Decision - 无需操作的决策
 */
export type NoopDecision = z.infer<typeof noopDecisionSchema>;

/**
 * AgentSignal - Agent 接收到的信号
 */
export type AgentSignal = z.infer<typeof agentSignalSchema>;

