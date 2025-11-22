import type { Immutable } from "mutative";
import type { AgentState, HistoryMessage } from "../agentState.ts";
import type { ReplyToUserEffect } from "../agentEffects.ts";
import type {
  AgentSignal,
  AssistantChunkReceivedSignal,
  AssistantMessageCompleteSignal,
} from "../agentSignal.ts";
import type { EffectInitializer, RunEffectOptions } from "./types.ts";
import type { Dispatch } from "./effectInitializer.ts";
import { createEffectInitializer } from "./effectInitializer.ts";
import { now } from "../../utils/time.ts";

/**
 * 收集相关的历史消息（从第一条消息到 lastHistoryMessageId 的所有消息）
 */
const getRelatedHistoryMessages = (
  state: Immutable<AgentState>,
  lastHistoryMessageId: string
): HistoryMessage[] => {
  const relatedHistoryMessages: HistoryMessage[] = [];
  let foundLastMessage = false;

  // 从后往前遍历，找到 lastHistoryMessageId，然后收集从起点到它的所有消息
  for (let i = state.historyMessages.length - 1; i >= 0; i--) {
    const msg = state.historyMessages[i]!;
    if (msg.id === lastHistoryMessageId) {
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

  return relatedHistoryMessages;
};

/**
 * 处理 chunks 迭代
 */
const processChunks = async (
  chunkIterator: AsyncIterator<string>,
  messageId: string,
  sendUserMessageChunk: (messageId: string, chunk: string) => void,
  dispatch: Dispatch,
  isCancelled: () => boolean
): Promise<void> => {
  while (true) {
    const { done, value } = await chunkIterator.next();
    if (done) {
      break;
    }
    if (isCancelled()) {
      return;
    }
    
    // 直接调用回调
    sendUserMessageChunk(messageId, value);

    // dispatch assistant-chunk-received 信号
    const chunkSignal: AssistantChunkReceivedSignal = {
      kind: "assistant-chunk-received",
      messageId,
      chunk: value,
      timestamp: now(),
    };
    dispatch(chunkSignal as Immutable<AgentSignal>);
  }
};

/**
 * 完成回复消息
 */
const completeReplyMessage = (
  messageId: string,
  completeUserMessage: (messageId: string) => void,
  dispatch: Dispatch
): void => {
  // 调用 completeUserMessage 回调
  completeUserMessage(messageId);

  // dispatch assistant-message-complete 信号
  const completeSignal: AssistantMessageCompleteSignal = {
    kind: "assistant-message-complete",
    messageId,
    timestamp: now(),
  };
  dispatch(completeSignal as Immutable<AgentSignal>);
};

/**
 * 创建 ReplyToUserEffect 的初始器
 */
export const createReplyToUserEffectInitializer = (
  effect: Immutable<ReplyToUserEffect>,
  state: Immutable<AgentState>,
  key: string,
  options: RunEffectOptions
): EffectInitializer =>
  createEffectInitializer(
    async (dispatch: Dispatch, isCancelled: () => boolean) => {
      const {
        behavior: { speak },
        message: {
          sendChunk: sendUserMessageChunk,
          complete: completeUserMessage,
        },
      } = options;

      const messageId = effect.messageId;

      // 验证 reply context
      const replyContext = state.replies[messageId];
      if (!replyContext) {
        throw new Error(`Reply context not found for messageId: ${messageId}`);
      }

      // 收集相关的历史消息
      const relatedHistoryMessages = getRelatedHistoryMessages(
        state,
        replyContext.lastHistoryMessageId
      );

      // 调用流式 LLM（speak）：向用户解释说明
      const chunkIterator = await speak(
        state.systemPrompts,
        Array.from(relatedHistoryMessages)
      );

      // 处理 chunks
      await processChunks(
        chunkIterator,
        messageId,
        sendUserMessageChunk,
        dispatch,
        isCancelled
      );

      if (isCancelled()) {
        return;
      }

      // 完成回复消息
      completeReplyMessage(messageId, completeUserMessage, dispatch);
    }
  );
