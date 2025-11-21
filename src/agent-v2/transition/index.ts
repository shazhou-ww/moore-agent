import type { Immutable } from "mutative";
import type { AgentState } from "../agentState.ts";
import type { AgentSignal } from "../agentSignal.ts";
import { handleUserMessageReceived } from "./userMessageReceived.ts";
import { handleActionCompleted } from "./actionCompleted.ts";
import { handleActionRequestRefined } from "./actionRequestRefined.ts";
import { handleActionCancelledByUser } from "./actionCancelledByUser.ts";
import { handleAssistantChunkReceived } from "./assistantChunkReceived.ts";
import { handleAssistantMessageComplete } from "./assistantMessageComplete.ts";
import { handleReactionComplete } from "./reactionComplete.ts";

/**
 * 状态转换函数（通用版本）
 * 将信号应用到状态，返回新状态
 * 
 * 符合 moorex 的 transition signature: (signal) => (state) => state
 */
export const transition = (
  signal: Immutable<AgentSignal>,
) => (state: Immutable<AgentState>): Immutable<AgentState> => {
  // 验证 timestamp（对于需要验证的信号）
  if (
    signal.kind === "user-message-received" ||
    signal.kind === "assistant-chunk-received" ||
    signal.kind === "assistant-message-complete" ||
    signal.kind === "reaction-complete"
  ) {
    if (signal.timestamp <= state.lastReactionTimestamp) {
      throw new Error(
        `Invalid timestamp: signal timestamp (${signal.timestamp}) must be greater than lastReactionTimestamp (${state.lastReactionTimestamp})`,
      );
    }
  }

  // 处理不同类型的信号
  switch (signal.kind) {
    case "user-message-received":
      return handleUserMessageReceived(signal, state) as Immutable<AgentState>;

    case "action-completed":
      return handleActionCompleted(signal, state) as Immutable<AgentState>;

    case "action-request-refined":
      return handleActionRequestRefined(signal, state) as Immutable<AgentState>;

    case "action-cancelled-by-user":
      return handleActionCancelledByUser(signal, state) as Immutable<AgentState>;

    case "assistant-chunk-received":
      return handleAssistantChunkReceived(signal, state) as Immutable<AgentState>;

    case "assistant-message-complete":
      return handleAssistantMessageComplete(signal, state) as Immutable<AgentState>;

    case "reaction-complete":
      return handleReactionComplete(signal, state) as Immutable<AgentState>;

    default:
      // 类型守卫：确保所有信号类型都被处理
      const _exhaustive: never = signal;
      return _exhaustive;
  }
};

