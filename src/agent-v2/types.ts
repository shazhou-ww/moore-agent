/**
 * Agent V2 类型定义
 */

/**
 * 工具定义
 */
export type ToolDefinition = {
  schema: string; // JSON Schema 字符串
};

/**
 * 工具请求详情
 */
export type ToolRequest = {
  toolName: string;
  parameters: string; // JSON 字符串
  timestamp: number;
};

/**
 * 工具响应详情
 */
export type ToolResponse = {
  result: string; // 结果字符串（成功或失败信息）
  timestamp: number;
};

/**
 * 历史消息
 */
export type HistoryMessage = {
  id: string;
  type: "assistant" | "user";
  content: string;
  timestamp: number;
};

/**
 * Assistant Streaming Chunk
 */
export type AssistantChunk = {
  content: string;
};

/**
 * AgentState - Agent 的完整状态
 */
export type AgentState = {
  // 1. 当前 Agent 的 system prompts
  systemPrompts: string;

  // 2. 当前 Agent 的工具定义
  tools: Record<string, ToolDefinition>;

  // 3. 当前 Agent 已经发起的 tool requests
  toolRequests: Record<string, ToolRequest>;

  // 4. 当前 Agent 已经完成的 tool request 的结果
  toolResponses: Record<string, ToolResponse>;

  // 5. 当前 Assistant 关注的 tool request
  focusedToolRequests: string[]; // tool request id 数组

  // 6. Agent 和用户之间往来的历史消息（不包含 Agent 和 tool 之间的消息）
  historyMessages: HistoryMessage[];

  // 7. 最近一次调用 LLM 的时间戳
  lastSentToLLMAt: number;

  // 8. 尚未完成 streaming 的 assistant chunks
  pendingChunks: AssistantChunk[];
};

/**
 * LLM Call Effect - 需要发起一个 LLM Call
 */
export type LLMCallEffect = {
  kind: "llm-call";
  // 可以添加其他必要字段，如 prompt, messageWindow 等
};

/**
 * Tool Request Effect - 需要发起一个 Tool Request
 */
export type ToolRequestEffect = {
  kind: "tool-request";
  toolRequestId: string;
  toolName: string;
  parameters: string; // JSON 字符串
};

/**
 * AgentEffect - Agent 需要执行的效果
 */
export type AgentEffect = LLMCallEffect | ToolRequestEffect;

/**
 * User Message Received Signal - 用户发了一条消息
 */
export type UserMessageReceivedSignal = {
  kind: "user-message-received";
  messageId: string;
  content: string;
  timestamp: number;
};

/**
 * Tool Responded Signal - 一个工具调用返回（成功或失败）
 */
export type ToolRespondedSignal = {
  kind: "tool-responded";
  toolRequestId: string;
  result: string; // 结果字符串（成功或失败信息）
  timestamp: number;
};

/**
 * Tool Requested Signal - Agent 发起一个 Tool Request
 */
export type ToolRequestedSignal = {
  kind: "tool-requested";
  toolRequestId: string;
  toolName: string;
  parameters: string; // JSON 字符串
  timestamp: number;
};

/**
 * Tool Cancelled Signal - Agent 取消一个 Tool Request
 */
export type ToolCancelledSignal = {
  kind: "tool-cancelled";
  toolRequestId: string;
  timestamp: number;
};

/**
 * Assistant Chunk Received Signal - 收到 LLM Streaming Chunk
 */
export type AssistantChunkReceivedSignal = {
  kind: "assistant-chunk-received";
  chunk: string;
  timestamp: number;
};

/**
 * Assistant Message Complete Signal - LLM Streaming 结束
 */
export type AssistantMessageCompleteSignal = {
  kind: "assistant-message-complete";
  messageId: string;
  timestamp: number;
};

/**
 * AgentSignal - Agent 接收到的信号
 */
export type AgentSignal =
  | UserMessageReceivedSignal
  | ToolRespondedSignal
  | ToolRequestedSignal
  | ToolCancelledSignal
  | AssistantChunkReceivedSignal
  | AssistantMessageCompleteSignal;

