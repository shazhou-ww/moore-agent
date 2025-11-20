import type { FrozenJson } from "@hstore/core";
import type { AgentState, HistoryMessage } from "../agentState.ts";
import type { AssistantMessageCompleteSignal } from "../agentSignal.ts";
import { appendHistoryMessage } from "./utils.ts";

/**
 * 处理 assistant-message-complete 信号（用于 reply）
 * 
 * Transition 效果：
 * - 假设收到的 signal 的 timestamp 一定是晚于 historyMessages 的最后一个的
 * - 从 replies 中找到对应的 context，将 chunks 合并成完整的 assistant 消息内容
 * - 如果 timestamp 晚于最后一个消息，直接追加到 historyMessages 的末尾
 * - 如果 timestamp 不满足条件，log warning 并忽略这条 message（从 replies 中移除，但不更新 historyMessages）
 * - 从 replies 中移除对应的 context
 * - 注意：不更新 lastReactionTimestamp（只有 reaction-complete 才更新）
 * 
 * 注意：我们不会将消息插入到 historyMessages 中间，因为这会影响 effectsAt 的计算假设
 */
export const handleAssistantMessageComplete = <T extends AgentState | FrozenJson<AgentState>>(
  signal: AssistantMessageCompleteSignal,
  state: T,
): T => {
  // 直接通过 messageId 索引对应的 context
  const context = state.replies[signal.messageId];
  if (!context) {
    console.warn(
      `Ignoring assistant-message-complete signal for messageId ${signal.messageId}. ` +
      `No matching replies context found.`
    );
    return state;
  }

  // 合并所有 pending chunks 成完整内容
  const content = context.chunks.map((chunk) => chunk.content).join("");

  const assistantMessage: HistoryMessage = {
    id: signal.messageId,
    type: "assistant",
    content,
    timestamp: signal.timestamp,
  };

  const newHistoryMessages = appendHistoryMessage(
    state.historyMessages,
    assistantMessage,
  );

  // 从 replies 中移除对应的 context
  const { [signal.messageId]: _, ...newReplies } = state.replies;

  // 如果追加失败（返回 null），移除 replies 但不更新 historyMessages
  if (newHistoryMessages === null) {
    return {
      ...state,
      replies: newReplies,
    } as T;
  }

  // 成功追加，更新相关状态（不更新 lastReactionTimestamp）
  return {
    ...state,
    historyMessages: newHistoryMessages,
    replies: newReplies,
  } as T;
};

