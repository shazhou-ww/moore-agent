import type { Immutable } from "mutative";
import type { AgentState, HistoryMessage } from "../../agentState.ts";

/**
 * Reaction 上下文
 */
export type ReactionContext = {
  unrespondedUserMessages: HistoryMessage[];
  unrespondedActionIds: string[];
};

/**
 * 收集尚未响应的消息和 action responses
 */
export const collectUnrespondedItems = (
  state: Immutable<AgentState>,
  lastReactionTimestamp: number,
): ReactionContext => {
  // 收集尚未响应的用户消息（timestamp > lastReactionTimestamp）
  const unrespondedUserMessages = state.historyMessages.filter(
    (msg) => msg.type === "user" && msg.timestamp > lastReactionTimestamp,
  );

  // 收集尚未响应的 action responses（timestamp > lastReactionTimestamp）
  const unrespondedActionIds: string[] = [];
  for (const [actionRequestId, response] of Object.entries(state.actionResponses)) {
    if (response.timestamp > lastReactionTimestamp) {
      unrespondedActionIds.push(actionRequestId);
    }
  }

  return { unrespondedUserMessages, unrespondedActionIds };
};

/**
 * 计算消息轮次（user 和 assistant 的交替为一轮）
 */
export const calculateMessageRounds = (messages: readonly HistoryMessage[]): number => {
  if (messages.length === 0) return 0;
  
  let rounds = 0;
  let lastType: "user" | "assistant" | null = null;
  
  for (const msg of messages) {
    if (lastType === null || msg.type !== lastType) {
      if (msg.type === "user") {
        rounds++;
      }
      lastType = msg.type;
    }
  }
  
  return rounds;
};
