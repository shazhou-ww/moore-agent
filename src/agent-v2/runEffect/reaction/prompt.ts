import type { Immutable } from "mutative";
import type { AgentState } from "../../agentState.ts";
import type { IterationState } from "./index.ts";

/**
 * 提取可用的 actions descriptions
 */
const extractAvailableActions = (
  state: Immutable<AgentState>,
): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(state.actions).map(([name, def]) => [name, def.description]),
  );
};

/**
 * 构建 actions 列表文本
 */
const buildActionsList = (availableActions: Record<string, string>): string => {
  return Object.entries(availableActions)
    .map(([name, description]) => `- ${name}: ${description}`)
    .join("\n");
};

/**
 * 获取 action 的状态
 */
const getActionStatus = (
  response: Immutable<AgentState["actionResponses"][string]> | undefined,
): "pending" | "completed" | "cancelled" => {
  if (!response) {
    return "pending";
  }
  return response.type === "cancelled" ? "cancelled" : "completed";
};

/**
 * 格式化单个 action summary
 */
const formatActionSummary = (
  actionRequestId: string,
  request: Immutable<AgentState["actionRequests"][string]>,
  response: Immutable<AgentState["actionResponses"][string]> | undefined,
  parameters: string | undefined,
  includeDetails: boolean,
): string => {
  const status = getActionStatus(response);
  let text = `- ID: ${actionRequestId}, Name: ${request.actionName}, Intention: ${request.intention}, Status: ${status}`;

  if (includeDetails) {
    const requestDetail = JSON.stringify({
      actionName: request.actionName,
      intention: request.intention,
      parameters: parameters ? JSON.parse(parameters) : undefined,
    });
    text += `\n  Request: ${requestDetail}`;

    if (response) {
      const responseDetail = JSON.stringify({
        type: response.type,
        ...(response.type === "completed" ? { result: response.result } : {}),
      });
      text += `\n  Response: ${responseDetail}`;
    }
  }

  return text;
};

/**
 * 构建所有 action summaries 的文本
 */
const buildActionSummariesText = (
  state: Immutable<AgentState>,
  loadedActionDetailIds: Set<string>,
): string => {
  return Object.entries(state.actionRequests)
    .map(([actionRequestId, request]) => {
      const response = state.actionResponses[actionRequestId];
      const parameters = state.actionParameters[actionRequestId];
      const includeDetails = loadedActionDetailIds.has(actionRequestId);

      return formatActionSummary(
        actionRequestId,
        request,
        response,
        parameters,
        includeDetails,
      );
    })
    .join("\n");
};

/**
 * 构建历史信息提示
 */
const buildHistoryInfo = (
  totalMessages: number,
  currentMessages: number,
): string => {
  if (totalMessages <= currentMessages) {
    return "";
  }
  return `\n注意：当前只显示了最近 ${currentMessages} 条消息，还有 ${totalMessages - currentMessages} 条消息未加载。如果需要更多历史消息，可以调用 decide 函数并传入 { type: "more-history" }。`;
};

/**
 * 构建系统提示词
 */
export const buildSystemPrompt = (
  state: Immutable<AgentState>,
  iterationState: IterationState,
): string => {
  const availableActions = extractAvailableActions(state);
  const actionsList = buildActionsList(availableActions);
  const actionSummariesText = buildActionSummariesText(
    state,
    iterationState.loadedActionDetailIds,
  );

  const totalMessages = state.historyMessages.length;
  const currentMessages = iterationState.currentHistoryCount;
  const historyInfo = buildHistoryInfo(totalMessages, currentMessages);

  return `## Reaction Decision Task

你需要根据当前状态决定下一步的计划。

### 可用的 Action 类型：
${actionsList}

### 已发起的 Actions：
${actionSummariesText || "（无）"}
${historyInfo}

### 决策选项：
1. **noop**: 什么都不需要做
2. **reply-to-user**: 已做了需要的动作，收集了足够的信息，需要对用户输出
3. **adjust-actions**: 增减 Actions 以收集需要的信息，执行必要的行为

请调用 decide 函数来做出决策。如果需要更多信息，可以：
- 调用 decide({ type: "more-history" }) 来获取更多历史消息
- 调用 decide({ type: "action-detail", ids: [...] }) 来获取特定 action 的详情（request & response）

---

## 主线任务的系统提示词
================================================================================
${state.systemPrompts}
================================================================================
`;
};

