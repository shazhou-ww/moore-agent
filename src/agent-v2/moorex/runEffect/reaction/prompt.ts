import type { Immutable } from "mutative";
import type { AgentState } from "../../agentState.ts";
import type { IterationState } from "./index.ts";

/**
 * Format JSON object in a code block (只包含 JSON，不包含函数调用)
 */
const codeBlockJson = (obj: unknown): string => {
  const jsonString = JSON.stringify(obj, null, 2);
  return `\`\`\`json\n${jsonString}\n\`\`\``;
};

/**
 * Extract available actions descriptions
 */
const extractAvailableActions = (
  state: Immutable<AgentState>,
): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(state.actionDefinitions).map(([name, def]) => [name, def.description]),
  );
};

/**
 * Build actions list text
 */
const buildActionsList = (availableActions: Record<string, string>): string => {
  return Object.entries(availableActions)
    .map(([name, description]) => `- ${name}: ${description}`)
    .join("\n");
};

/**
 * Derive current action status for summary table
 */
const getActionStatus = (
  action: Immutable<AgentState["actions"][string]>,
): "pending" | "completed" | "cancelled" => {
  const response = action.response;
  if (!response) {
    return "pending";
  }
  return response.type === "cancelled" ? "cancelled" : "completed";
};

/**
 * Build running actions table text
 */
const buildRunningActionsTable = (state: Immutable<AgentState>): string => {
  const entries = Object.entries(state.actions);
  if (entries.length === 0) {
    return "(none)";
  }

  const header = "| ID | Name | Intention | Status |";
  const separator = "| --- | --- | --- | --- |";
  const rows = entries.map(([actionId, action]) => {
    const status = getActionStatus(action);
    return `| ${actionId} | ${action.request.actionName} | ${action.request.intention} | ${status} |`;
  });

  return [header, separator, ...rows].join("\n");
};

/**
 * Build history info hint
 */
const buildHistoryInfo = (
  totalMessages: number,
  currentMessages: number,
  funcName: string,
): { info: string; hasMoreHistory: boolean } => {
  if (totalMessages <= currentMessages) {
    return {
      info: `\nNote: All ${totalMessages} messages are currently loaded. There are no more history messages available.`,
      hasMoreHistory: false,
    };
  }
  return {
    info: `\nNote: Currently showing only the last ${currentMessages} messages, with ${totalMessages - currentMessages} messages not loaded. If you need more history messages, you can call the ${funcName} function with { type: "more-history" }.`,
    hasMoreHistory: true,
  };
};

/**
 * Build system prompt（柯里化最后一个参数）
 */
export const buildSystemPrompt = (
  state: Immutable<AgentState>,
  iterationState: IterationState,
) => (funcName: string): string => {
  const availableActions = extractAvailableActions(state);
  const actionsList = buildActionsList(availableActions);
  const runningActionsText = buildRunningActionsTable(state);

  const totalMessages = state.historyMessages.length;
  const currentMessages = iterationState.currentHistoryCount;
  const { info: historyInfo, hasMoreHistory } = buildHistoryInfo(totalMessages, currentMessages, funcName);

  // 根据是否有更多 history 构建示例部分
  const moreHistoryExample = hasMoreHistory
    ? `Get more history messages:

${codeBlockJson({ type: "more-history" })}

`
    : "";

  return `## Reaction Decision

Decide the next action based on current state.

### Available Actions:
${actionsList}

### Running Actions:
${runningActionsText}

### History Info
${historyInfo}

### Decision Priority:

**1. adjust-actions** (PRIORITY):
- **Always use actions first** to gather information before replying
- Create actions when you need external info, real-time data, or verification
- Cancel irrelevant actions and add new ones as needed

**2. reply-to-user**:
- Only when you have ALL required information from completed actions
- Never guess - use actions to get accurate data

### Examples:

Get action details:
${codeBlockJson({ 
  type: "action-detail", 
  ids: ["action-id-1"] 
})}

${moreHistoryExample}Create actions to gather information:
${codeBlockJson({ 
  type: "decision-made", 
  decision: { 
    type: "adjust-actions", 
    cancelActions: [], 
    newActions: [
      { 
        actionName: "webSearch", 
        initialIntent: "Search for information about [topic]" 
      }
    ] 
  } 
})}

Reply when you have all information:
${codeBlockJson({ 
  type: "decision-made", 
  decision: { 
    type: "reply-to-user" 
  } 
})}

---

## Main Task System Prompt (for reference)
================================================================================
${state.systemPrompts}
================================================================================
`;
};

