import type { Immutable } from "mutative";
import type { AgentEffect } from "../agentEffects.ts";
import type {
  AgentSignal,
  AssistantChunkReceivedSignal,
  AssistantMessageCompleteSignal,
} from "../agentSignal.ts";
import type {
  EffectInitializer,
  StreamLLMFn,
  SendUserMessageChunkFn,
  CompleteUserMessageFn,
} from "./types.ts";
import { now } from "../../utils/time.ts";

/**
 * 创建 ReplyToUserEffect 的初始器
 */
export const createReplyToUserEffectInitializer = (
  effect: Immutable<Extract<AgentEffect, { kind: "reply-to-user" }>>,
  streamLLM: StreamLLMFn,
  sendUserMessageChunk: SendUserMessageChunkFn,
  completeUserMessage: CompleteUserMessageFn,
): EffectInitializer => {
  let canceled = false;
  // messageId 就是 effect.key（例如 "reply-{hash}"）
  const messageId = effect.key;

  return {
    start: async (dispatch: (signal: Immutable<AgentSignal>) => void) => {
      if (canceled) {
        return;
      }

      try {
        let chunkQueue: string[] = [];
        let totalLength = 0;
        const CHUNK_QUEUE_SIZE_THRESHOLD = 100; // chunk 合并阈值

        // 发送 chunk 的函数，带合并逻辑
        const flushChunks = () => {
          if (chunkQueue.length > 0 && !canceled) {
            const mergedChunk = chunkQueue.join("");
            // 调用 sendUserMessageChunk 回调
            sendUserMessageChunk(mergedChunk);

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
          if (canceled) {
            return;
          }
          chunkQueue.push(chunk);
          totalLength += chunk.length;

          // 如果 queue 中的内容超过阈值，触发 flush
          if (totalLength >= CHUNK_QUEUE_SIZE_THRESHOLD) {
            flushChunks();
          }
        };

        // 调用流式 LLM
        await streamLLM(effect.systemPrompts, Array.from(effect.relatedHistoryMessages), handleChunk);

        if (canceled) {
          return;
        }

        // 先 flush 剩余的 chunks
        flushChunks();

        // 调用 completeUserMessage 回调
        completeUserMessage();

        // dispatch assistant-message-complete 信号
        const completeSignal: AssistantMessageCompleteSignal = {
          kind: "assistant-message-complete",
          messageId,
          timestamp: now(),
        };
        dispatch(completeSignal as Immutable<AgentSignal>);
      } catch (error) {
        if (!canceled) {
          console.error("ReplyToUserEffect failed:", error);
          throw error;
        }
      }
    },
    cancel: () => {
      canceled = true;
    },
  };
};

