/**
 * Reaction Effect - 基于最近的输入，让 LLM 做下一步动作的规划
 * 
 * 用途：
 * - 判断是否需要取消一些 action
 * - 判断是否需要新开一些 action
 * - 判断是否需要直接对用户回复
 * 
 * 输入：
 * - 上次 ReactionEffect 之后更新的 user messages 和 action responses（从 state 中获取）
 * - 所有 action requests 的状态信息（从 state 中获取）
 * 
 * 输出：
 * - 结构化决策结果（取消哪些 action、新开哪些 action、或者直接回复）
 * 
 * 注意：Reaction 是 non-streaming 的，直接返回决策结果
 */
export type ReactionEffect = {
  kind: "reaction";
  // 此次 reaction 的 timestamp，应该是 max(last user message timestamp, last action response timestamp)
  // 用于判断是否有新的输入，其他数据从 state 中获取
  timestamp: number;
};

/**
 * 回复用户 Effect - 生成 streaming 回复消息给用户
 * 
 * 用途：
 * - 根据当前状态和上下文，生成对用户的回复
 * - 支持 streaming 输出
 * 
 * 输入（从 state 中获取）：
 * - 系统提示词：state.systemPrompts
 * - 相关的历史消息：从 state.replies[messageId].lastHistoryMessageId 确定
 * - 相关的 action requests 和 responses：从 state.replies[messageId].relatedActionIds 确定
 */
export type ReplyToUserEffect = {
  kind: "reply-to-user";
  // messageId 对应 state.replies 的 key，用于查找回复上下文
  messageId: string;
};

/**
 * 细化 Action 调用 Effect - 结合上下文，细化 action 调用的具体参数
 * 
 * 用途：
 * - 当确定了需要调用某个 action 后，进一步细化调用参数
 * - 结合历史消息、action responses 等上下文，生成具体的 action parameter
 * 
 * 输入（从 state 中获取）：
 * - 目标 action 的定义：state.actionDefinitions[action.request.actionName]
 * - 初始意图：state.actions[actionId].request.intention
 * - 相关上下文：state.historyMessages、state.actions 等
 * 
 * 输出：
 * - 细化的 action parameter（JSON 字符串）
 */
export type RefineActionCallEffect = {
  kind: "refine-action-call";
  // actionId 用于从 state.actions 中查找对应的 action
  actionId: string;
};

/**
 * Action Request Effect - 需要发起一个 Action Request
 * 
 * 注意：这个 effect 通常由 RefineActionCallEffect 的结果触发，表示已经细化完成，可以直接执行
 * 
 * 输入（从 state 中获取）：
 * - action 信息：state.actions[actionId]
 *   - request：action.request
 *   - parameter：action.parameter
 */
export type ActionRequestEffect = {
  kind: "action-request";
  // actionId 用于从 state.actions 中查找对应的 action
  actionId: string;
};

/**
 * AgentEffect - Agent 需要执行的效果
 */
export type AgentEffect =
  | ReactionEffect
  | ReplyToUserEffect
  | RefineActionCallEffect
  | ActionRequestEffect;

