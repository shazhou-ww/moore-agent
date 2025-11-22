import type { FrozenJson } from "@hstore/core";
import type {
  AgentState,
  HistoryMessage,
  ActionDefinition,
  ActionRequest,
  ActionResponse,
  Action,
  AssistantChunk,
  ReplyToUserContext,
} from "@/agent-v2/index.ts";

// 重新导出 agent-v2 的类型
export type {
  AgentState,
  HistoryMessage,
  ActionDefinition,
  ActionRequest,
  ActionResponse,
  Action,
  AssistantChunk,
  ReplyToUserContext,
};

// 前端特有的事件类型
export type AgentEvent = {
  type: string;
  state: FrozenJson<AgentState>;
};

// 用于前端显示的临时消息类型
export type UserMessage = {
  id: string;
  kind: "user";
  content: string;
  timestamp: number;
};

