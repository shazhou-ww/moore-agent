import type { Immutable } from "mutative";
import type { AgentState, HistoryMessage } from "../../agentState.ts";

/**
 * 收集尚未响应的消息和 action responses
 */
export const collectUnrespondedItems = (
  state: Immutable<AgentState>,
  lastReactionTimestamp: number,
): {
  unrespondedUserMessages: HistoryMessage[];
  unrespondedActionIds: string[];
} => {
  // 收集尚未响应的用户消息（timestamp > lastReactionTimestamp）
  const unrespondedUserMessages = state.historyMessages.filter(
    (msg) => msg.type === "user" && msg.timestamp > lastReactionTimestamp,
  );

  // 收集尚未响应的 action responses（timestamp > lastReactionTimestamp）
  const unrespondedActionIds: string[] = [];
  for (const [actionRequestId, response] of Object.entries(state.actionResponses)) {
    if (response.timestamp > lastReactionTimestamp) {
      unrespondedActionIds.push(actionRequestId);
    }
  }

  return { unrespondedUserMessages, unrespondedActionIds };
};

/**
 * 计算消息轮次（user 和 assistant 的交替为一轮）
 */
export const calculateMessageRounds = (messages: readonly HistoryMessage[]): number => {
  if (messages.length === 0) return 0;
  
  let rounds = 0;
  let lastType: "user" | "assistant" | null = null;
  
  for (const msg of messages) {
    if (lastType === null || msg.type !== lastType) {
      if (msg.type === "user") {
        rounds++;
      }
      lastType = msg.type;
    }
  }
  
  return rounds;
};

/**
 * 获取最近 n 轮的消息
 * 一轮 = 一个 user message + 对应的 assistant message（如果有）
 */
export const getRecentMessageRounds = (
  messages: readonly HistoryMessage[],
  rounds: number,
): HistoryMessage[] => {
  if (rounds <= 0 || messages.length === 0) return [];
  
  // 从后往前找到最近的 n 个 user message
  const userMessageIndices: number[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.type === "user") {
      userMessageIndices.push(i);
      if (userMessageIndices.length >= rounds) {
        break;
      }
    }
  }
  
  if (userMessageIndices.length === 0) {
    return [];
  }
  
  // 找到最早的 user message 的索引
  const earliestUserIndex = Math.min(...userMessageIndices);
  
  // 返回从最早 user message 开始到末尾的所有消息
  // 转换为可变数组
  return Array.from(messages.slice(earliestUserIndex));
};

/**
 * 构建 action 基本信息列表（不含详情）
 */
export const buildActionSummary = (
  state: Immutable<AgentState>,
  includeDetailsForIds: Set<string>,
): Array<{
  id: string;
  name: string;
  intention: string;
  status: "pending" | "completed" | "cancelled";
  request?: string; // JSON 字符串，仅当 includeDetailsForIds 包含此 id 时
  response?: string; // JSON 字符串，仅当 includeDetailsForIds 包含此 id 时
}> => {
  const summaries: Array<{
    id: string;
    name: string;
    intention: string;
    status: "pending" | "completed" | "cancelled";
    request?: string;
    response?: string;
  }> = [];

  for (const [actionRequestId, request] of Object.entries(state.actionRequests)) {
    const response = state.actionResponses[actionRequestId];
    const parameters = state.actionParameters[actionRequestId];
    
    let status: "pending" | "completed" | "cancelled" = "pending";
    if (response) {
      status = response.type === "cancelled" ? "cancelled" : "completed";
    }

    const summary: {
      id: string;
      name: string;
      intention: string;
      status: "pending" | "completed" | "cancelled";
      request?: string;
      response?: string;
    } = {
      id: actionRequestId,
      name: request.actionName,
      intention: request.intention,
      status,
    };

    // 如果需要详情，添加 request 和 response
    if (includeDetailsForIds.has(actionRequestId)) {
      summary.request = JSON.stringify({
        actionName: request.actionName,
        intention: request.intention,
        parameters: parameters ? JSON.parse(parameters) : undefined,
      });
      
      if (response) {
        summary.response = JSON.stringify({
          type: response.type,
          ...(response.type === "completed" ? { result: response.result } : {}),
        });
      }
    }

    summaries.push(summary);
  }

  return summaries;
};

