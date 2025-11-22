import type { Immutable } from "mutative";
import type { AgentState, AssistantChunk, ReplyToUserContext } from "../agentState.ts";
import type { AssistantChunkReceivedSignal } from "../agentSignal.ts";

/**
 * 处理 assistant-chunk-received 信号
 * 
 * Transition 效果：
 * - 将 chunk 添加到对应的 replies 中的 context
 * - 通过 messageId 直接索引对应的 reply context
 * - 不更新 lastReactionTimestamp（streaming 尚未完成）
 */
export const handleAssistantChunkReceived = (
  signal: Immutable<AssistantChunkReceivedSignal>,
  state: Immutable<AgentState>,
): Immutable<AgentState> => {
  const newChunk: AssistantChunk = {
    content: signal.chunk,
  };

  // 直接通过 messageId 索引对应的 context
  const context = state.replies[signal.messageId];
  if (!context) {
    console.warn(
      `Ignoring assistant-chunk-received signal for messageId ${signal.messageId}. ` +
      `No matching replies context found.`
    );
    return state;
  }

  // 更新对应的 context，只修改 chunks 字段
  const newReplies = {
    ...state.replies,
    [signal.messageId]: {
      ...context,
      chunks: [...context.chunks, newChunk],
    },
  };

  return {
    ...state,
    replies: newReplies,
  };
};

