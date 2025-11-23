import type { Immutable } from "mutative";
import type { AgentState, HistoryMessage, Action } from "../agentState.ts";
import type { ReplyToUserEffect } from "../agentEffects.ts";
import type {
  AgentSignal,
  AssistantChunkReceivedSignal,
  AssistantMessageCompleteSignal,
} from "../agentSignal.ts";
import type { EffectInitializer, RunEffectOptions } from "./types.ts";
import type { Dispatch } from "./effectInitializer.ts";
import { createEffectInitializer } from "./effectInitializer.ts";
import { buildActionTools, buildActionToolCalls } from "./actionTooling.ts";

const ACTION_INFO_TOOLS = buildActionTools();

const collectRespondedActions = (
  actions: Immutable<AgentState["actions"]>,
): Record<string, Action> =>
  Object.fromEntries(
    Object.entries(actions).filter(
      ([, action]) => action.response !== null,
    ),
  ) as Record<string, Action>;

/**
 * 收集相关的历史消息（基于时间戳，获取 timestamp 之前的所有消息）
 */
const getRelatedHistoryMessages = (
  state: Immutable<AgentState>,
  timestamp: number
): Immutable<HistoryMessage[]> => {
  // 返回 timestamp 之前（包含等于）的所有消息
  return state.historyMessages.filter(
    (msg) => msg.timestamp <= timestamp
  );
};

/**
 * 发送 chunk 接收信号
 */
const dispatchChunkReceived = (
  messageId: string,
  chunk: string,
  dispatch: Dispatch
): void => {
  const chunkSignal: AssistantChunkReceivedSignal = {
    kind: "assistant-chunk-received",
    messageId,
    chunk,
    timestamp: Date.now(),
  };
  dispatch(chunkSignal as Immutable<AgentSignal>);
};

/**
 * 完成回复消息
 */
const completeReplyMessage = (
  messageId: string,
  dispatch: Dispatch
): void => {
  // dispatch assistant-message-complete 信号
  const completeSignal: AssistantMessageCompleteSignal = {
    kind: "assistant-message-complete",
    messageId,
    timestamp: Date.now(),
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
      } = options;

      const messageId = effect.messageId;

      // 验证 reply context
      const replyContext = state.replies[messageId];
      if (!replyContext) {
        throw new Error(`Reply context not found for messageId: ${messageId}`);
      }

      // 收集相关的历史消息（基于 decision made 的时间戳）
      const relatedHistoryMessages = getRelatedHistoryMessages(
        state,
        replyContext.timestamp
      );

      // 收集已获得结果的 actions
      const respondedActions = collectRespondedActions(state.actions);

      // 获取已发送的内容（从 chunks 中提取），如果没有则传空字符串
      const sentContent = replyContext.chunks.map((chunk) => chunk.content).join("")

      const supplementalToolCalls = buildActionToolCalls(respondedActions);

      // 调用流式 LLM（speak）：向用户解释说明
      const chunkGenerator = await speak(
        state.systemPrompts,
        Array.from(relatedHistoryMessages),
        ACTION_INFO_TOOLS,
        supplementalToolCalls,
        sentContent
      );
      for await (const chunk of chunkGenerator) {
        if (isCancelled()) {
          return;
        }
        
        // dispatch assistant-chunk-received 信号
        dispatchChunkReceived(messageId, chunk, dispatch);
      }

      // 完成回复消息
      completeReplyMessage(messageId, dispatch);
    }
  );
