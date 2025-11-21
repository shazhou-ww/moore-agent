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
 * 创建 ReplyToUserEffect 的初始器
 */
export const createReplyToUserEffectInitializer = (
  effect: Immutable<ReplyToUserEffect>,
  state: Immutable<AgentState>,
  key: string,
  options: RunEffectOptions,
): EffectInitializer => {
  const { streamLLM, sendUserMessageChunk, completeUserMessage } = options;
  
  return createEffectInitializer(
    async (dispatch: Dispatch, isCancelled: () => boolean) => {
      // messageId 从 effect 中获取
      const messageId = effect.messageId;
      if (isCancelled()) {
        return;
      }

      try {
        // 从 state.replies[messageId] 获取上下文
        const replyContext = state.replies[messageId];
        if (!replyContext) {
          throw new Error(`Reply context not found for messageId: ${messageId}`);
        }

        // 从 state 获取 systemPrompts
        const systemPrompts = state.systemPrompts;

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

        let chunkQueue: string[] = [];
        let totalLength = 0;
        const CHUNK_QUEUE_SIZE_THRESHOLD = 100; // chunk 合并阈值

        // 发送 chunk 的函数，带合并逻辑
        const flushChunks = () => {
          if (chunkQueue.length > 0 && !isCancelled()) {
            const mergedChunk = chunkQueue.join("");
            // 调用 sendUserMessageChunk 回调，传入 messageId
            sendUserMessageChunk(messageId, mergedChunk);

            // dispatch assistant-chunk-received 信号
            const chunkSignal: AssistantChunkReceivedSignal = {
              kind: "assistant-chunk-received",
              messageId,
              chunk: mergedChunk,
              timestamp: now(),
            };
            dispatch(chunkSignal as Immutable<AgentSignal>);

            chunkQueue = [];
            totalLength = 0;
          }
        };

        // 处理单个 chunk
        const handleChunk = (chunk: string) => {
          if (isCancelled()) {
            return;
          }
          chunkQueue.push(chunk);
          totalLength += chunk.length;

          // 如果 queue 中的内容超过阈值，触发 flush
          if (totalLength >= CHUNK_QUEUE_SIZE_THRESHOLD) {
            flushChunks();
          }
        };

        // 调用流式 LLM，使用 'reply-to-user' scene
        await streamLLM(
          "reply-to-user",
          systemPrompts,
          Array.from(relatedHistoryMessages),
          handleChunk,
        );

        if (isCancelled()) {
          return;
        }

        // 先 flush 剩余的 chunks
        flushChunks();

        // 调用 completeUserMessage 回调，传入 messageId
        completeUserMessage(messageId);

        // dispatch assistant-message-complete 信号
        const completeSignal: AssistantMessageCompleteSignal = {
          kind: "assistant-message-complete",
          messageId,
          timestamp: now(),
        };
        dispatch(completeSignal as Immutable<AgentSignal>);
      } catch (error) {
        if (!isCancelled()) {
          console.error("ReplyToUserEffect failed:", error);
          throw error;
        }
      }
    },
  );
};

