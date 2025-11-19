import { z } from "zod";

/**
 * Action 定义 Schema
 */
export const actionDefinitionSchema = z.object({
  schema: z.string(), // JSON Schema 字符串
  description: z.string(),
});

/**
 * Action 请求详情 Schema
 */
export const actionRequestSchema = z.object({
  actionName: z.string(),
  parameters: z.string(), // JSON 字符串
  intention: z.string(), // 描述 action 的目的
  timestamp: z.number(),
});

/**
 * Action 响应详情 Schema
 */
export const actionResponseSchema = z.object({
  result: z.string(), // 结果字符串（成功或失败信息）
  timestamp: z.number(),
});

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
 * AgentState Schema - Agent 的完整状态
 */
export const agentStateSchema = z.object({
  // 1. 当前 Agent 的 system prompts
  systemPrompts: z.string(),

  // 2. 当前 Agent 的 Action 定义
  actions: z.record(z.string(), actionDefinitionSchema),

  // 3. 当前 Agent 已经发起的 action requests
  actionRequests: z.record(z.string(), actionRequestSchema),

  // 4. 当前 Agent 已经完成的 action request 的结果
  actionResponses: z.record(z.string(), actionResponseSchema),

  // 5. 当前 Assistant 关注的 action request
  focusedActionRequests: z.array(z.string()), // action request id 数组

  // 6. Agent 和用户之间往来的历史消息（不包含 Agent 和 action 之间的消息）
  historyMessages: z.array(historyMessageSchema),

  // 7. 最近一次调用 LLM 的时间戳
  lastSentToLLMAt: z.number(),

  // 8. 尚未完成 streaming 的 assistant chunks
  pendingChunks: z.array(assistantChunkSchema),
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
 * AgentState - Agent 的完整状态
 */
export type AgentState = z.infer<typeof agentStateSchema>;

