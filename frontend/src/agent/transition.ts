import type { AgentState, Signal } from "../types.ts";

/**
 * 将消息插入 messages 并保持按 timestamp 排序
 */
const insertMessage = (
  messages: ReadonlyArray<Signal>,
  newMessage: Signal,
): ReadonlyArray<Signal> => {
  const result = [...messages];
  let insertIndex = result.length;

  for (let i = 0; i < result.length; i++) {
    if (newMessage.timestamp < result[i]!.timestamp) {
      insertIndex = i;
      break;
    }
  }

  result.splice(insertIndex, 0, newMessage);
  return result;
};

/**
 * 状态转换函数（前端版本）
 */
export const transition = (signal: Signal) => (state: AgentState): AgentState => {
  // 验证 timestamp
  if (signal.timestamp <= state.lastSentToLLMAt) {
    return state; // 忽略无效的 timestamp
  }

  // 插入消息并保持排序
  const newMessages = insertMessage(state.messages, signal);

  // 返回新状态
  return {
    ...state,
    messages: newMessages,
  };
};

