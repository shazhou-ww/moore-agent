import { pick, mapValues } from "lodash";
import type { AgentState } from "./moorex/agentState.ts";
import type { ActionWithRun } from "./types.ts";
import type { createPersistenceStore } from "./adapters/persistence.ts";
import debug from "debug";

const log = debug("agent-v2:state");

/**
 * 创建初始 AgentState
 */
export const createInitialAgentState = (
  systemPrompts: string,
  actions: Record<string, ActionWithRun>,
): AgentState => {
  // 提取 action definitions（不包含 run 函数）
  const actionDefinitions = mapValues(actions, (action) =>
    pick(action, ["schema", "description"]),
  );

  return {
    systemPrompts,
    actionDefinitions,
    actions: {},
    historyMessages: [],
    lastReactionTimestamp: Date.now(),
    replies: {},
  };
};

/**
 * 加载或创建初始状态
 */
export const loadOrCreateInitialState = async (
  store: Awaited<ReturnType<typeof createPersistenceStore>>["store"],
  systemPrompts: string,
  actions: Record<string, ActionWithRun>,
): Promise<AgentState> => {
  const head = await store.head();
  if (head?.value) {
    log("Loaded state from persistence");
    // 将 readonly 的数据转换为可变的 AgentState
    const loadedState = head.value as AgentState;
    return {
      ...loadedState,
      historyMessages: [...loadedState.historyMessages],
      actions: { ...loadedState.actions },
      replies: { ...loadedState.replies },
    };
  }

  log("Creating new initial state");
  return createInitialAgentState(systemPrompts, actions);
};

