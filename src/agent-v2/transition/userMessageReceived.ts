import type { FrozenJson } from "@hstore/core";
import type { AgentState, HistoryMessage } from "../agentState.ts";
import type { UserMessageReceivedSignal } from "../agentSignal.ts";
import { appendHistoryMessage } from "./utils.ts";

/**
 * 处理 user-message-received 信号
 * 
 * Transition 效果：
 * - 假设收到的 userMessage 的 timestamp 一定是晚于 historyMessages 的最后一个的
 * - 如果 timestamp 晚于最后一个消息，直接追加到 historyMessages 的末尾
 * - 如果 timestamp 不满足条件，log warning 并忽略这条 message（不更新状态）
 * - 不更新 lastReactionTimestamp（用户消息不是 reaction 结果）
 * 
 * 注意：我们不会将消息插入到 historyMessages 中间，因为这会影响 effectsAt 的计算假设
 */
export const handleUserMessageReceived = <T extends AgentState | FrozenJson<AgentState>>(
  signal: UserMessageReceivedSignal,
  state: T,
): T => {
  const userMessage: HistoryMessage = {
    id: signal.messageId,
    type: "user",
    content: signal.content,
    timestamp: signal.timestamp,
  };

  const newHistoryMessages = appendHistoryMessage(
    state.historyMessages,
    userMessage,
  );

  // 如果追加失败（返回 null），返回原状态
  if (newHistoryMessages === null) {
    return state;
  }

  return {
    ...state,
    historyMessages: newHistoryMessages,
  } as T;
};

