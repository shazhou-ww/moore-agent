import type { FrozenJson } from "@hstore/core";
import type { AgentState, HistoryMessage } from "../agentState.ts";
import type { ReplyToUserEffect } from "../agentEffects.ts";

/**
 * 提取所有 ReplyToUserEffect
 * 
 * 如果 replies 中有 context，说明 reaction 已经决定要回复用户，需要生成 streaming 回复
 * 所有 replies 中的 context 都需要生成回复（可以并发）
 */
export const extractReplyToUserEffects = (
  state: FrozenJson<AgentState>,
): ReplyToUserEffect[] => {
  const effects: ReplyToUserEffect[] = [];

  for (const [messageId, replyContext] of Object.entries(state.replies)) {
    // 收集相关的历史消息（从第一条消息到 lastHistoryMessageId 的所有消息）
    const relatedHistoryMessages: HistoryMessage[] = [];
    let foundLastMessage = false;
    
    // 从后往前遍历，找到 lastHistoryMessageId，然后收集从起点到它的所有消息
    for (let i = state.historyMessages.length - 1; i >= 0; i--) {
      const msg = state.historyMessages[i]!;
      if (msg.id === replyContext.lastHistoryMessageId) {
        foundLastMessage = true;
      }
      if (foundLastMessage) {
        relatedHistoryMessages.unshift(msg);
      }
    }

    // 如果找不到 lastHistoryMessageId，使用所有历史消息作为后备
    if (!foundLastMessage) {
      relatedHistoryMessages.push(...state.historyMessages);
    }

    // 收集相关的 action requests 和 responses
    const relatedActionRequests = replyContext.relatedActionIds
      .map((actionRequestId) => {
        const request = state.actionRequests[actionRequestId];
        if (!request) return null;
        const parameters = state.actionParameters[actionRequestId] || "";
        return {
          actionRequestId,
          actionName: request.actionName,
          parameters,
          intention: request.intention,
        };
      })
      .filter((req): req is NonNullable<typeof req> => req !== null);

    const relatedActionResponses = replyContext.relatedActionIds
      .map((actionRequestId) => {
        const response = state.actionResponses[actionRequestId];
        if (!response) return null;
        return {
          actionRequestId,
          type: response.type,
          result: response.type === "completed" ? response.result : undefined,
        };
      })
      .filter((resp): resp is NonNullable<typeof resp> => resp !== null);

    const replyEffect: ReplyToUserEffect = {
      key: messageId, // messageId 就是 hash(lastHistoryMessageId + sorted actionIds)
      kind: "reply-to-user",
      systemPrompts: state.systemPrompts,
      relatedHistoryMessages,
      lastHistoryMessageId: replyContext.lastHistoryMessageId,
      relatedActionIds: [...replyContext.relatedActionIds], // 创建新的可变数组
      relatedActionRequests,
      relatedActionResponses,
    };

    effects.push(replyEffect);
  }

  return effects;
};

