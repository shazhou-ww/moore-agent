import type { Immutable } from "mutative";
import type { AgentState } from "./agentState.ts";
import type {
  AgentEffect,
  ReactionEffect,
  ReplyToUserEffect,
  RefineActionCallEffect,
  ActionRequestEffect,
} from "./agentEffects.ts";

/**
 * 提取 ReactionEffect
 *
 * 触发条件：当且仅当存在比上一次 reaction 更新的 ActionResponse 或 UserMessage
 * （timestamp > lastReactionTimestamp）
 *
 * 注意：ReplyToUserEffect 可以有多条并行，不影响 Reaction 决策
 */
const extractReactionEffect = ({
  historyMessages,
  actions,
  lastReactionTimestamp,
}: Immutable<AgentState>): ReactionEffect | null => {
  // 计算此次 reaction 的 timestamp：max(last user message timestamp, last action response timestamp)
  const userMessageTimestamps = historyMessages
    // 只取用户消息且时间戳大于上次 reaction 时间
    .filter(({ type, timestamp }) => type === "user" && timestamp > lastReactionTimestamp)
    .map(({ timestamp }) => timestamp);
  
  const actionResponseTimestamps = Object.values(actions)
    // 只取有 response 且时间戳大于上次 reaction 时间的 action
    .filter((action) => action.response && action.response.timestamp > lastReactionTimestamp)
    .map((action) => action.response!.timestamp);
  
  const timestamp = Math.max(
    ...userMessageTimestamps,
    ...actionResponseTimestamps,
    -Infinity
  );

  // 如果计算出的 timestamp 不大于 lastReactionTimestamp，说明没有新的输入，不需要 Reaction
  return timestamp > lastReactionTimestamp
    ? { kind: "reaction", timestamp }
    : null;
};

/**
 * 提取所有 ReplyToUserEffect
 *
 * 如果 replies 中有 context，说明 reaction 已经决定要回复用户，需要生成 streaming 回复
 * 所有 replies 中的 context 都需要生成回复（可以并发）
 *
 * Effect 只包含 messageId，其他数据在 runEffect 时从 state.replies[messageId] 和 state 中获取
 */
const extractReplyToUserEffects = ({
  replies,
}: Immutable<AgentState>): ReplyToUserEffect[] =>
  Object.keys(replies).map(
    (messageId): ReplyToUserEffect => ({
      kind: "reply-to-user",
      messageId, // messageId 对应 state.replies 的 key
    })
  );

/**
 * 提取所有 RefineActionCallEffect
 *
 * 所有没有 parameter 的 actions 都需要细化（可以并发）
 *
 * Effect 只包含 actionId，其他数据在 runEffect 时从 state 中获取
 */
const extractRefineActionCallEffects = (
  state: Immutable<AgentState>
): RefineActionCallEffect[] =>
  Object.entries(state.actions)
    .filter(
      ([actionId, action]) =>
        !action.response && // 如果已经有 response，跳过
        !action.parameter && // 如果没有 parameter，需要细化
        state.actionDefinitions[action.request.actionName] // 如果 action 定义不存在，跳过
    )
    .map(
      ([actionId]): RefineActionCallEffect => ({
        kind: "refine-action-call",
        actionId,
      })
    );

/**
 * 提取所有 ActionRequestEffect
 *
 * 所有有 parameter 但没有 response 的 actions 都需要执行（可以并发）
 *
 * Effect 只包含 actionId，其他数据在 runEffect 时从 state 中获取
 */
const extractActionRequestEffects = ({
  actions,
}: Immutable<AgentState>): ActionRequestEffect[] =>
  Object.entries(actions)
    .filter(
      ([actionId, action]) =>
        !action.response && // 如果已经有 response，跳过
        action.parameter !== null // 如果有 parameter，需要执行
    )
    .map(
      ([actionId]): ActionRequestEffect => ({
        kind: "action-request",
        actionId,
      })
    );

/**
 * 为 effect 生成唯一的 key（用于 Record）
 */
const getEffectKey = (effect: AgentEffect): string => {
  switch (effect.kind) {
    case "reaction":
      return `reaction-${effect.timestamp}`;
    case "reply-to-user":
      return `reply-${effect.messageId}`;
    case "refine-action-call":
      return `refine-action-${effect.actionId}`;
    case "action-request":
      return `action-request-${effect.actionId}`;
    default:
      const _exhaustive: never = effect;
      throw new Error(`Unknown effect kind: ${(_exhaustive as AgentEffect).kind}`);
  }
};

/**
 * 根据状态推导需要执行的 effects
 *
 * 所有 effects 都可以并发执行，函数会返回当前状态下所有需要执行的 effects：
 *
 * 1. ReplyToUserEffect - 所有 replies 中的 context 都需要生成回复（可以并发）
 * 2. ReactionEffect - 如果有新的用户消息或新的 action responses，且没有待处理的 ReplyToUserEffect，需要做反应
 * 3. RefineActionCallEffect - 所有没有 parameters 的 action requests 都需要细化（可以并发）
 * 4. ActionRequestEffect - 所有有 parameters 但没有 response 的 action requests 都需要执行（可以并发）
 */
export const effectsAt = (state: Immutable<AgentState>): Record<string, Immutable<AgentEffect>> => {
  const reactionEffect = extractReactionEffect(state);
  const effects: AgentEffect[] = [
    ...extractReplyToUserEffects(state),
    ...(reactionEffect ? [reactionEffect] : []),
    ...extractRefineActionCallEffects(state),
    ...extractActionRequestEffects(state),
  ];

  // 转换为 Record<string, Immutable<AgentEffect>>
  const result: Record<string, Immutable<AgentEffect>> = {};
  for (const effect of effects) {
    result[getEffectKey(effect)] = effect as Immutable<AgentEffect>;
  }
  return result;
};

