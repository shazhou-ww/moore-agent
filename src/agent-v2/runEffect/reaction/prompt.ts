/**
 * 构建系统提示词
 */
export const buildSystemPrompt = (
  baseSystemPrompts: string,
  availableActions: Record<string, string>,
  actionSummaries: Array<{
    id: string;
    name: string;
    intention: string;
    status: "pending" | "completed" | "cancelled";
    request?: string;
    response?: string;
  }>,
  messageRounds: number,
  totalRounds: number,
): string => {
  const actionsList = Object.entries(availableActions)
    .map(([name, description]) => `- ${name}: ${description}`)
    .join("\n");

  const actionSummariesText = actionSummaries
    .map((summary) => {
      let text = `- ID: ${summary.id}, Name: ${summary.name}, Intention: ${summary.intention}, Status: ${summary.status}`;
      if (summary.request) {
        text += `\n  Request: ${summary.request}`;
      }
      if (summary.response) {
        text += `\n  Response: ${summary.response}`;
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
${actionSummaries.length > 0 ? actionSummariesText : "（无）"}
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
${baseSystemPrompts}
================================================================================
`;
};

