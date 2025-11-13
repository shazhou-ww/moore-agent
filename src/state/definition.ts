import type { AgentState, Signal, SystemMessage } from "../types/schema.ts";
import type { Effect } from "../types/effects.ts";
import { transition } from "./transition.ts";
import { effectsAt } from "./effects.ts";
import { now, before } from "../utils/time.ts";
import { createId } from "../utils/id.ts";

export type AgentDefinitionDeps = {
  systemPrompt: string;
  createdAt?: number;
  initialState?: AgentState;
};

/**
 * 创建初始状态
 */
const createInitialState = (deps: AgentDefinitionDeps): AgentState => {
  // 如果提供了初始状态，直接使用
  if (deps.initialState) {
    return deps.initialState;
  }
  
  // 否则创建新状态
  const createdAt = deps.createdAt ?? now();
  const systemMessage: SystemMessage = {
    id: createId(),
    kind: "system",
    content: deps.systemPrompt,
    timestamp: createdAt,
  };
  
  return {
    systemMessage,
    messages: [],
    lastSentToLLMAt: before(createdAt, 1), // createdAt - 1，确保系统消息仍被视为未发送
  };
};

/**
 * 创建 Agent 状态机定义
 */
export const createAgentDefinition = (
  deps: AgentDefinitionDeps,
): {
  initialState: AgentState;
  transition: (signal: Signal) => (state: AgentState) => AgentState;
  effectsAt: (state: AgentState) => Effect[];
} => {
  return {
    initialState: createInitialState(deps),
    transition,
    effectsAt,
  };
};

