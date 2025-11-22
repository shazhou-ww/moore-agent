import type { Immutable } from "mutative";
import type { AgentState, ActionResponse } from "../../agentState.ts";
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
 * Get action status
 */
const getActionStatus = (
  response: Immutable<ActionResponse> | null,
): "pending" | "completed" | "cancelled" => {
  if (!response) {
    return "pending";
  }
  return response.type === "cancelled" ? "cancelled" : "completed";
};

/**
 * Format single action summary
 */
const formatActionSummary = (
  actionId: string,
  action: Immutable<AgentState["actions"][string]>,
  includeDetails: boolean,
): string => {
  const status = getActionStatus(action.response);
  let text = `- ID: ${actionId}, Name: ${action.request.actionName}, Intention: ${action.request.intention}, Status: ${status}`;

  if (includeDetails) {
    const requestDetail = JSON.stringify({
      actionName: action.request.actionName,
      intention: action.request.intention,
      parameters: action.parameter ? JSON.parse(action.parameter) : undefined,
    });
    text += `\n  Request: ${requestDetail}`;

    if (action.response) {
      const responseDetail = JSON.stringify({
        type: action.response.type,
        ...(action.response.type === "completed" ? { result: action.response.result } : {}),
      });
      text += `\n  Response: ${responseDetail}`;
    }
  }

  return text;
};

/**
 * Build all action summaries text
 */
const buildActionSummariesText = (
  state: Immutable<AgentState>,
  loadedActionDetailIds: Set<string>,
): string => {
  return Object.entries(state.actions)
    .map(([actionId, action]) => {
      const includeDetails = loadedActionDetailIds.has(actionId);

      return formatActionSummary(
        actionId,
        action,
        includeDetails,
      );
    })
    .join("\n");
};

/**
 * Build history info hint
 */
const buildHistoryInfo = (
  totalMessages: number,
  currentMessages: number,
  funcName: string,
): string => {
  if (totalMessages <= currentMessages) {
    return "";
  }
  return `\nNote: Currently showing only the last ${currentMessages} messages, with ${totalMessages - currentMessages} messages not loaded. If you need more history messages, you can call the ${funcName} function with { type: "more-history" }.`;
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
  const actionSummariesText = buildActionSummariesText(
    state,
    iterationState.loadedActionDetailIds,
  );

  const totalMessages = state.historyMessages.length;
  const currentMessages = iterationState.currentHistoryCount;
  const historyInfo = buildHistoryInfo(totalMessages, currentMessages, funcName);

  return `## Reaction Decision Task

You need to decide on the next plan based on the current state.

### Available Action Types:
${actionsList}

### Initiated Actions:
${actionSummariesText || "(none)"}
${historyInfo}

### Decision Options:
1. **noop**: Nothing needs to be done
2. **reply-to-user**: You have completed the necessary actions, collected sufficient information, and need to respond to the user
3. **adjust-actions**: Adjust actions based on context analysis:
   - **Cancel actions**: Cancel running actions that are no longer needed based on the current context
   - **Add actions**: Create new actions that are needed to supplement the current task based on context analysis

Please call the ${funcName} function to make a decision. Examples:

**To get more information:**

Get more history messages:

${codeBlockJson({ type: "more-history" })}

Get details for specific actions:

${codeBlockJson({ 
  type: "action-detail", 
  ids: ["action-id-1", "action-id-2"] 
})}

**To make a final decision:**

No action needed:

${codeBlockJson({ 
  type: "decision-made", 
  decision: { type: "noop" } 
})}

Reply to the user:

${codeBlockJson({ 
  type: "decision-made", 
  decision: { 
    type: "reply-to-user", 
    lastHistoryMessageId: "message-id", 
    relatedActionIds: ["action-id-1", "action-id-2"] 
  } 
})}

Adjust actions based on context analysis:

Cancel running actions that are no longer needed, and add new actions that are required:

${codeBlockJson({ 
  type: "decision-made", 
  decision: { 
    type: "adjust-actions", 
    cancelActions: ["action-id-1"], 
    newActions: [
      { 
        actionId: "new-action-id", 
        actionName: "action-name", 
        initialIntent: "intent description" 
      }
    ] 
  } 
})}

---

## Main Task System Prompt (for reference)
================================================================================
${state.systemPrompts}
================================================================================
`;
};

