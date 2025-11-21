import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { ReactionEffect } from "../agentEffects.ts";

/**
 * 提取 ReactionEffect
 * 
 * 触发条件：当且仅当存在比上一次 reaction 更新的 ActionResponse 或 UserMessage
 * （timestamp > lastReactionTimestamp）
 * 
 * 注意：ReplyToUserEffect 可以有多条并行，不影响 Reaction 决策
 */
export const extractReactionEffect = ({
  historyMessages,
  actionResponses,
  lastReactionTimestamp,
}: Immutable<AgentState>): ReactionEffect | null => {
  // 计算此次 reaction 的 timestamp：max(last user message timestamp, last action response timestamp)
  const timestamp = Math.max(
    ...historyMessages
      // 只取用户消息且时间戳大于上次 reaction 时间
      .filter(({ type, timestamp }) => type === "user" && timestamp > lastReactionTimestamp)
      .map(({ timestamp }) => timestamp),
    ...Object.entries(actionResponses)
      // 只取时间戳大于上次 reaction 时间的 action response
      .filter(([_, { timestamp }]) => timestamp > lastReactionTimestamp)
      .map(([_, { timestamp }]) => timestamp)
  );

  // 如果计算出的 timestamp 不大于 lastReactionTimestamp，说明没有新的输入，不需要 Reaction
  return timestamp > lastReactionTimestamp
    ? { kind: "reaction", timestamp }
    : null;
};

