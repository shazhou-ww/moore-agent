import type { FrozenJson } from "@hstore/core";
import type { AgentState } from "../agentState.ts";
import type { ReactionEffect } from "../agentEffects.ts";
import { createHash } from "crypto";

/**
 * 判断 action 的 status
 */
const getActionStatus = (
  actionRequestId: string,
  actionResponses: AgentState["actionResponses"],
): "ongoing" | "completed" | "cancelled" => {
  const response = actionResponses[actionRequestId];
  if (!response) {
    return "ongoing";
  }
  
  // 直接返回 response 的 type
  return response.type;
};

/**
 * 提取 ReactionEffect
 * 
 * 触发条件：当且仅当存在比上一次 reaction 更新的 ActionResponse 或 UserMessage
 * （timestamp > lastReactionTimestamp）
 * 
 * 注意：ReplyToUserEffect 可以有多条并行，不影响 Reaction 决策
 * 
 * Key 生成：由 <timestamp, latestActionResponseId, latestUserMessageId> hash 计算得来
 */
export const extractReactionEffect = (
  state: FrozenJson<AgentState>,
): ReactionEffect | null => {
  // 找到比 lastReactionTimestamp 更新的 UserMessage
  const newUserMessages = state.historyMessages.filter(
    (msg) => msg.type === "user" && msg.timestamp > state.lastReactionTimestamp,
  );

  // 找到比 lastReactionTimestamp 更新的 ActionResponse
  const newActionResponses = Object.entries(state.actionResponses)
    .filter(([_, response]) => response.timestamp > state.lastReactionTimestamp)
    .map(([actionRequestId, response]) => ({
      actionRequestId,
      type: response.type as "completed" | "cancelled",
      result: response.type === "completed" ? response.result : undefined,
      timestamp: response.timestamp,
    }));

  // 当且仅当存在新的 UserMessage 或 ActionResponse 时才需要 Reaction
  if (newUserMessages.length === 0 && newActionResponses.length === 0) {
    return null;
  }

  // 计算此次 reaction 的 timestamp：max(last user message timestamp, last action response timestamp)
  const lastUserMessageTimestamp = newUserMessages.length > 0
    ? Math.max(...newUserMessages.map((msg) => msg.timestamp))
    : 0;
  const lastActionResponseTimestamp = newActionResponses.length > 0
    ? Math.max(...newActionResponses.map((r) => r.timestamp))
    : 0;
  const timestamp = Math.max(lastUserMessageTimestamp, lastActionResponseTimestamp);

  // 找到最新的 UserMessage 和 ActionResponse（用于 key 计算）
  const latestUserMessage = newUserMessages.length > 0
    ? newUserMessages.reduce((latest, msg) => 
        msg.timestamp > latest.timestamp ? msg : latest
      )
    : null;

  const latestActionResponse = newActionResponses.length > 0
    ? newActionResponses.reduce((latest, response) => 
        response.timestamp > latest.timestamp ? response : latest
      )
    : null;

  // 收集所有 action requests 及其状态
  const actionRequests = Object.entries(state.actionRequests).map(
    ([actionRequestId, request]) => ({
      actionRequestId,
      actionName: request.actionName,
      intention: request.intention,
      status: getActionStatus(actionRequestId, state.actionResponses),
    }),
  );

  // 生成 reaction key: hash(timestamp, latestActionResponseId, latestUserMessageId)
  const latestActionResponseId = latestActionResponse?.actionRequestId ?? "";
  const latestUserMessageId = latestUserMessage?.id ?? "";
  const keyInput = `${timestamp}:${latestActionResponseId}:${latestUserMessageId}`;
  const reactionKey = `reaction-${createHash("sha256").update(keyInput).digest("hex")}`;

  const reactionEffect: ReactionEffect = {
    key: reactionKey,
    kind: "reaction",
    newUserMessages,
    newActionResponses,
    actionRequests,
    timestamp,
  };

  return reactionEffect;
};

