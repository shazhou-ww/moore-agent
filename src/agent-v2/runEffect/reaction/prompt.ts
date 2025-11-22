import type { Immutable } from "mutative";
import type { AgentState } from "../../agentState.ts";
import { calculateMessageRounds } from "./utils.ts";
import type { IterationState } from "./index.ts";

/**
 * 构建系统提示词
 */
export const buildSystemPrompt = (
  state: Immutable<AgentState>,
  iterationState: IterationState,
): string => {
  // 从 state 中提取 actions descriptions
  const availableActions = Object.fromEntries(
    Object.entries(state.actions).map(([name, def]) => [name, def.description]),
  );

  // 计算总的消息轮次
  const totalRounds = calculateMessageRounds(state.historyMessages);
  const messageRounds = iterationState.currentHistoryRounds;

  const actionsList = Object.entries(availableActions)
    .map(([name, description]) => `- ${name}: ${description}`)
    .join("\n");

  // 直接根据 state 和 loadedActionDetailIds 渲染 action summaries
  const actionSummariesText = Object.entries(state.actionRequests)
    .map(([actionRequestId, request]) => {
      const response = state.actionResponses[actionRequestId];
      const parameters = state.actionParameters[actionRequestId];
      
      let status: "pending" | "completed" | "cancelled" = "pending";
      if (response) {
        status = response.type === "cancelled" ? "cancelled" : "completed";
      }

      let text = `- ID: ${actionRequestId}, Name: ${request.actionName}, Intention: ${request.intention}, Status: ${status}`;
      
      // 如果需要详情，添加 request 和 response
      if (iterationState.loadedActionDetailIds.has(actionRequestId)) {
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
    })
    .join("\n");

  const historyInfo = totalRounds > messageRounds
    ? `\n注意：当前只显示了最近 ${messageRounds} 轮消息，还有 ${totalRounds - messageRounds} 轮消息未加载。如果需要更多历史消息，可以调用 decide 函数并传入 { type: "more-history" }。`
    : "";

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

