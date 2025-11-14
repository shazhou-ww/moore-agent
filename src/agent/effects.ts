import type { freezeJson, FrozenJson } from "@hstore/core";
import type {
  AgentState,
  AssistantMessage,
  ToolMessage,
  UserMessage,
  PartialMessage,
} from "../types/schema.ts";
import type { Effect } from "../types/effects.ts";
import type { MessageWindow } from "../types/schema.ts";
import { makeLLMEffectKey, makeToolEffectKey, createId } from "../utils/id.ts";

/**
 * 获取 lastSentToLLMAt 之后的所有消息
 */
const getMessagesAfterLastSent = (
  messages: ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>,
  lastSentToLLMAt: number,
): ReadonlyArray<UserMessage | ToolMessage | AssistantMessage> => {
  return messages.filter((msg) => msg.timestamp > lastSentToLLMAt);
};

/**
 * 获取最后一条助手消息
 */
const getLatestAssistantMessage = (
  messages: ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>,
  lastSentToLLMAt: number,
): AssistantMessage | null => {
  const afterLastSent = getMessagesAfterLastSent(messages, lastSentToLLMAt);
  
  for (let i = afterLastSent.length - 1; i >= 0; i--) {
    const msg = afterLastSent[i];
    if (msg && msg.kind === "assistant") {
      return msg;
    }
  }
  
  return null;
};

/**
 * 检查工具调用是否已被 fulfill
 */
const isToolCallFulfilled = (
  assistantMessage: AssistantMessage,
  toolMessages: ReadonlyArray<ToolMessage>,
  toolCallId: string,
): boolean => {
  return toolMessages.some(
    (toolMsg) =>
      toolMsg.callId === toolCallId && toolMsg.timestamp > assistantMessage.timestamp,
  );
};

/**
 * 获取尚未被 fulfill 的工具调用
 */
const getUnfulfilledToolCalls = (
  assistantMessage: AssistantMessage,
  messages: ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>,
): ReadonlyArray<{ id: string; name: string; input: string }> => {
  const toolMessages = messages.filter(
    (msg): msg is ToolMessage => msg.kind === "tool",
  );
  
  return assistantMessage.toolCalls.filter(
    (toolCall) => !isToolCallFulfilled(assistantMessage, toolMessages, toolCall.id),
  );
};

/**
 * 根据状态推导需要执行的 effects
 */
export const effectsAt = (state: FrozenJson<AgentState>): Effect[] => {
  // 0. 优先检查是否有未完成的 assistant message
  if (state.partialMessage) {
    // 构建继续补全的 LLM call
    const pendingMessages = getMessagesAfterLastSent(
      state.messages as ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>,
      state.lastSentToLLMAt,
    );
    
    // 如果有待发送的消息，需要包含它们
    // 同时需要提示 LLM 基于之前的内容继续补全
    const existingContent = Array.from(state.partialMessage.chunks).join("");
    const continuationPrompt = `Continue from: "${existingContent}"`;
    
    return [
      {
        key: makeLLMEffectKey(state.partialMessage.messageId),
        kind: "call-llm",
        prompt: continuationPrompt,
        messageWindow: pendingMessages as MessageWindow,
      },
    ];
  }

  // 1. 先检查待执行的工具调用
  const latestAssistantMessage = getLatestAssistantMessage(
    state.messages as ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>,
    state.lastSentToLLMAt,
  );
  
  if (latestAssistantMessage) {
    const unfulfilledToolCalls = getUnfulfilledToolCalls(
      latestAssistantMessage,
      state.messages as ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>,
    );
    
    if (unfulfilledToolCalls.length > 0) {
      // 选择最早的工具调用
      const firstToolCall = unfulfilledToolCalls[0]!;
      return [
        {
          key: makeToolEffectKey(latestAssistantMessage.id, firstToolCall.id),
          kind: "call-tool",
          messageId: latestAssistantMessage.id,
          call: {
            id: firstToolCall.id,
            name: firstToolCall.name,
            input: firstToolCall.input,
          },
        },
      ];
    }
  }
  
  // 2. 若无待执行工具调用，再检查待发送给 LLM 的消息
  const pendingMessages = getMessagesAfterLastSent(
    state.messages as ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>,
    state.lastSentToLLMAt,
  );
  
  if (pendingMessages.length > 0) {
    // 生成新的 messageId 用于 assistant message
    const newMessageId = createId();
    return [
      {
        key: makeLLMEffectKey(newMessageId),
        kind: "call-llm",
        prompt: "", // prompt 将在 runEffect 中构建
        messageWindow: pendingMessages as MessageWindow,
      },
    ];
  }
  
  // 3. 若以上各项均不存在，则返回空数组，表示当前 idle
  return [];
};

