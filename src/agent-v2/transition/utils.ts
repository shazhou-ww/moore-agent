import type { HistoryMessage } from "../agentState.ts";
import { createHash } from "crypto";

/**
 * 将消息追加到 historyMessages 的末尾
 * 
 * 假设新消息的 timestamp 一定晚于最后一个消息。
 * 如果 timestamp 不满足条件，会 log warning 并返回 null。
 * 
 * @returns 如果成功追加，返回新的消息数组；如果不满足条件，返回 null
 */
export const appendHistoryMessage = (
  messages: ReadonlyArray<HistoryMessage>,
  newMessage: HistoryMessage,
): ReadonlyArray<HistoryMessage> | null => {
  // 如果 historyMessages 为空，直接追加
  if (messages.length === 0) {
    return [newMessage];
  }

  // 检查新消息的 timestamp 是否晚于最后一个消息
  const lastMessage = messages[messages.length - 1]!;
  if (newMessage.timestamp >= lastMessage.timestamp) {
    // 直接追加到末尾
    return [...messages, newMessage];
  }

  // timestamp 不满足条件，log warning 并返回 null
  const messageType = newMessage.type === "user" ? "user message" : "assistant message";
  console.warn(
    `Ignoring ${messageType} with timestamp ${newMessage.timestamp} ` +
    `(messageId: ${newMessage.id}). Last message timestamp: ${lastMessage.timestamp}. ` +
    `This message would break the effectsAt calculation assumption.`
  );
  
  return null;
};

/**
 * 计算 reply key: hash(lastHistoryMessageId + sorted actionIds)
 */
export const computeReplyKey = (
  lastHistoryMessageId: string,
  relatedActionIds: string[],
): string => {
  // 排序 actionIds 以确保一致性
  const sortedActionIds = [...relatedActionIds].sort();
  const input = `${lastHistoryMessageId}:${sortedActionIds.join(",")}`;
  return createHash("sha256").update(input).digest("hex");
};

