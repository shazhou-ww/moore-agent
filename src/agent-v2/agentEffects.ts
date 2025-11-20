import type { ActionDefinition, HistoryMessage, ActionRequest } from "./agentState.ts";

/**
 * Reaction Effect - 基于最近的输入，让 LLM 做下一步动作的规划
 * 
 * 用途：
 * - 判断是否需要取消一些 action
 * - 判断是否需要新开一些 action
 * - 判断是否需要直接对用户回复
 * 
 * 输入：
 * - 触发源：可能是用户消息或 action responses
 * - 当前进行中的 action requests 上下文
 * - 历史消息窗口
 * 
 * 输出：
 * - 结构化决策结果（取消哪些 action、新开哪些 action、或者直接回复）
 */
export type ReactionEffect = {
  key: string; // 用于 moorex 的 HasKey 约束，例如 "reaction-{messageId}"
  kind: "reaction";
  systemPrompts: string;
  messageWindow: HistoryMessage[]; // 包含相关的历史上下文
  // 触发源：可能是用户消息或 action responses
  trigger: {
    type: "user-message" | "action-responses";
    userMessageId?: string; // 如果是用户消息触发
    actionResponseIds?: string[]; // 如果是 action responses 触发
  };
  // 当前进行中的 action requests 信息，用于判断影响
  ongoingActionRequests: Array<{
    actionRequestId: string;
    actionName: string;
    intention: string;
  }>;
};

/**
 * 回复用户 Effect - 生成 streaming 回复消息给用户
 * 
 * 用途：
 * - 根据当前状态和上下文，生成对用户的回复
 * - 支持 streaming 输出
 * 
 * 输入：
 * - 系统提示词
 * - 历史消息窗口
 * - 当前状态（包括 action responses、ongoing actions 等）
 */
export type ReplyToUserEffect = {
  key: string; // 用于 moorex 的 HasKey 约束，例如 "reply-{messageId}"
  kind: "reply-to-user";
  systemPrompts: string;
  messageWindow: HistoryMessage[];
  // 用于生成回复的上下文信息
  context: {
    recentActionResponses?: Array<{
      actionRequestId: string;
      actionName: string;
      type: "completed" | "cancelled";
      result?: string; // 仅当 type 为 'completed' 时存在
    }>;
    ongoingActions?: Array<{
      actionRequestId: string;
      actionName: string;
      intention: string;
    }>;
  };
};

/**
 * 细化 Action 调用 Effect - 结合上下文，细化 action 调用的具体参数
 * 
 * 用途：
 * - 当确定了需要调用某个 action 后，进一步细化调用参数
 * - 结合历史消息、action responses 等上下文，生成具体的 action request
 * 
 * 输入：
 * - 目标 action 的定义
 * - 初始意图（来自 ReactionEffect 的决策结果）
 * - 相关上下文（历史消息、action responses 等）
 * 
 * 输出：
 * - 结构化的 action request（actionName, parameters, intention）
 *   其中 intention 是 LLM 根据上下文和初始意图理解生成的
 */
export type RefineActionCallEffect = {
  key: string; // 用于 moorex 的 HasKey 约束，例如 "refine-action-{actionRequestId}"
  kind: "refine-action-call";
  systemPrompts: string;
  messageWindow: HistoryMessage[];
  // 目标 action 信息
  targetAction: {
    name: string;
  } & ActionDefinition;
  // 初始意图（来自 ReactionEffect 的决策结果）
  initialIntent: string;
  // 相关上下文
  context: {
    recentActionResponses?: Array<{
      actionRequestId: string;
      actionName: string;
      type: "completed" | "cancelled";
      result?: string; // 仅当 type 为 'completed' 时存在
    }>;
    relatedOngoingActions?: Array<{
      actionRequestId: string;
      actionName: string;
      intention: string;
    }>;
  };
};

/**
 * Action Request Effect - 需要发起一个 Action Request
 * 注意：这个 effect 通常由 RefineActionCallEffect 的结果触发，表示已经细化完成，可以直接执行
 */
export type ActionRequestEffect = {
  key: string; // 用于 moorex 的 HasKey 约束，例如 "action-request-{actionRequestId}"
  kind: "action-request";
  request: ActionRequest;
};

/**
 * AgentEffect - Agent 需要执行的效果
 */
export type AgentEffect =
  | ReactionEffect
  | ReplyToUserEffect
  | RefineActionCallEffect
  | ActionRequestEffect;

