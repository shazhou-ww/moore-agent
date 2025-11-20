import { z } from "zod";

/**
 * Action 定义 Schema
 */
export const actionDefinitionSchema = z.object({
  schema: z.string(), // JSON Schema 字符串
  description: z.string(),
});

/**
 * Action 请求详情 Schema（不包含 parameters，parameters 单独存储）
 */
export const actionRequestSchema = z.object({
  actionName: z.string(),
  intention: z.string(), // 描述 action 的目的
  timestamp: z.number(),
});

/**
 * Action 响应详情 Schema
 * 支持两种类型：用户取消（cancelled）和正常完成（completed）
 */
export const actionResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cancelled"),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("completed"),
    result: z.string(), // 结果字符串（成功或失败信息）
    timestamp: z.number(),
  }),
]);

/**
 * 历史消息 Schema
 */
export const historyMessageSchema = z.object({
  id: z.string(),
  type: z.enum(["assistant", "user"]),
  content: z.string(),
  timestamp: z.number(),
});

/**
 * Assistant Streaming Chunk Schema
 */
export const assistantChunkSchema = z.object({
  content: z.string(),
});

/**
 * Reply To User Context Schema - 回复用户的上下文信息
 * 每个 reply 对应一个 context，包含相关的 history messages 和 action ids
 */
export const replyToUserContextSchema = z.object({
  messageId: z.string(), // 用于关联 chunks 和 complete signal
  lastHistoryMessageId: z.string(), // 最后一条相关的 history message id
  relatedActionIds: z.array(z.string()), // 相关的 action request ids（已排序）
  chunks: z.array(assistantChunkSchema), // 正在 stream 的 chunks
});

/**
 * AgentState Schema - Agent 的完整状态
 */
export const agentStateSchema = z.object({
  // 1. 当前 Agent 的 system prompts
  systemPrompts: z.string(),

  // 2. 当前 Agent 的 Action 定义
  actions: z.record(z.string(), actionDefinitionSchema),

  // 3. 当前 Agent 已经发起的 action requests（不包含 parameters）
  actionRequests: z.record(z.string(), actionRequestSchema),

  // 4. Action 请求的参数（JSON 字符串），key 是 actionRequestId
  actionParameters: z.record(z.string(), z.string()),

  // 5. 当前 Agent 已经完成的 action request 的结果
  actionResponses: z.record(z.string(), actionResponseSchema),

  // 6. Agent 和用户之间往来的历史消息（不包含 Agent 和 action 之间的消息）
  historyMessages: z.array(historyMessageSchema),

  // 7. 最近一次收到 reaction 结果的时间戳
  lastReactionTimestamp: z.number(),

  // 8. 正在进行的 reply to user streaming 操作
  // key 是 messageId（即 hash(lastHistoryMessageId + sorted actionIds)），value 是对应的 context
  // 这与 ReplyToUserEffect 的 key 保持一致
  replies: z.record(z.string(), replyToUserContextSchema),
});

// ==================== 类型导出 ====================

/**
 * Action 定义
 */
export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;

/**
 * Action 请求详情
 */
export type ActionRequest = z.infer<typeof actionRequestSchema>;

/**
 * Action 响应详情
 */
export type ActionResponse = z.infer<typeof actionResponseSchema>;

/**
 * 历史消息
 */
export type HistoryMessage = z.infer<typeof historyMessageSchema>;

/**
 * Assistant Streaming Chunk
 */
export type AssistantChunk = z.infer<typeof assistantChunkSchema>;

/**
 * Reply To User Context - 回复用户的上下文信息
 */
export type ReplyToUserContext = z.infer<typeof replyToUserContextSchema>;

/**
 * AgentState - Agent 的完整状态
 */
export type AgentState = z.infer<typeof agentStateSchema>;

