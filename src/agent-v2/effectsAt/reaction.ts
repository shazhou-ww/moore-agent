import type { FrozenJson } from "@hstore/core";
import type { AgentState } from "../agentState.ts";
import type { ReactionEffect } from "../agentEffects.ts";

/**
 * 提取 ReactionEffect
 * 
 * 触发条件：有新的用户消息或新的 action responses（timestamp > lastReactionTimestamp）
 * 注意：如果已经有 ReplyToUserEffect 在处理，说明已经决策过了，不需要再 Reaction
 */
export const extractReactionEffect = (
  state: FrozenJson<AgentState>,
): ReactionEffect | null => {
  // 如果已经有 ReplyToUserEffect 在处理，说明已经决策过了，不需要再 Reaction
  const hasPendingReplies = Object.keys(state.replies).length > 0;
  if (hasPendingReplies) {
    return null;
  }

  const newUserMessages = state.historyMessages.filter(
    (msg) => msg.type === "user" && msg.timestamp > state.lastReactionTimestamp,
  );

  const newActionResponses = Object.entries(state.actionResponses)
    .filter(([_, response]) => response.timestamp > state.lastReactionTimestamp)
    .map(([actionRequestId, _]) => actionRequestId);

  if (newUserMessages.length === 0 && newActionResponses.length === 0) {
    return null;
  }

  // 确定触发源
  const trigger: ReactionEffect["trigger"] =
    newUserMessages.length > 0
      ? {
          type: "user-message",
          userMessageId: newUserMessages[newUserMessages.length - 1]!.id,
        }
      : {
          type: "action-responses",
          actionResponseIds: newActionResponses,
        };

  // 收集当前进行中的 action requests（没有 response 的）
  const ongoingActionRequests = Object.entries(state.actionRequests)
    .filter(([actionRequestId]) => !(actionRequestId in state.actionResponses))
    .map(([actionRequestId, request]) => ({
      actionRequestId,
      actionName: request.actionName,
      intention: request.intention,
    }));

  // 生成 reaction key
  const reactionKey =
    trigger.type === "user-message"
      ? `reaction-${trigger.userMessageId}`
      : `reaction-${newActionResponses.sort().join("-")}`;

  const reactionEffect: ReactionEffect = {
    key: reactionKey,
    kind: "reaction",
    systemPrompts: state.systemPrompts,
    messageWindow: [...state.historyMessages], // 包含所有历史消息
    trigger,
    ongoingActionRequests,
  };

  return reactionEffect;
};

