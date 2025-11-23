import type { Action } from "../agentState.ts";
import type { ToolDefinition, ToolCall } from "./types.ts";

const ACTION_TOOL_NAME = "action";

const ACTION_INFO_TOOL: ToolDefinition = {
  schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Action name",
      },
      intention: {
        type: "string",
        description: "Action intention",
      },
    },
    required: ["name", "intention"],
    additionalProperties: false,
  },
  description: "Supplemental information about an action request.",
};

export const buildActionTools = (): Record<string, ToolDefinition> => ({
  [ACTION_TOOL_NAME]: ACTION_INFO_TOOL,
});

const buildToolCallResult = (action: Action): string => {
  if (!action.response) {
    return JSON.stringify({ status: "pending" });
  }
  if (action.response.type === "cancelled") {
    return JSON.stringify({ status: "cancelled" });
  }
  return JSON.stringify({
    status: "completed",
    result: action.response.result,
  });
};

const buildToolCallParameters = (action: Action): string =>
  JSON.stringify({
    name: action.request.actionName,
    intention: action.request.intention,
  });

const buildToolCall = (action: Action): ToolCall => ({
  name: ACTION_TOOL_NAME,
  parameters: buildToolCallParameters(action),
  result: buildToolCallResult(action),
  requestedAt: action.request.timestamp,
  respondedAt: Date.now(),
});

export const buildActionToolCalls = (
  actions: Record<string, Action>,
  filter?: (actionId: string, action: Action) => boolean,
): Record<string, ToolCall> => {
  const entries = Object.entries(actions)
    .filter(([actionId, action]) => (filter ? filter(actionId, action) : true))
    .map(([actionId, action]) => [actionId, buildToolCall(action)] as const);

  return Object.fromEntries(entries);
};

