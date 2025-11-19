import type { ActionDefinition, HistoryMessage, ActionRequest } from "./agentState.ts";

/**
 * LLM Call Target - Action 类型
 */
export type LLMCallTargetAction = {
  type: "action";
  name: string;
} & ActionDefinition;

/**
 * LLM Call Target - User 类型
 */
export type LLMCallTargetUser = {
  type: "user";
};

/**
 * LLM Call Target
 */
export type LLMCallTarget = LLMCallTargetAction | LLMCallTargetUser;

/**
 * LLM Call Effect - 需要发起一个 LLM Call
 */
export type LLMCallEffect = {
  key: string; // 用于 moorex 的 HasKey 约束
  kind: "llm-call";
  systemPrompts: string;
  messageWindow: HistoryMessage[];
  target: LLMCallTarget;
};

/**
 * Action Request Effect - 需要发起一个 Action Request
 */
export type ActionRequestEffect = {
  key: string; // 用于 moorex 的 HasKey 约束
  kind: "action-request";
  request: ActionRequest;
};

/**
 * AgentEffect - Agent 需要执行的效果
 */
export type AgentEffect = LLMCallEffect | ActionRequestEffect;

