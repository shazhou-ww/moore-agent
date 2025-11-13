import type { Moorex } from "moorex";
import type { AgentState } from "../types/state.ts";
import type { Signal } from "../types/state.ts";
import type { Effect } from "../types/effects.ts";
import { createAgentMachine, type AgentMachineDeps } from "../state/machine.ts";
import { createAdapter, closeAdapter, type AdapterOptions } from "../persistence/adapter.ts";
import { createStateStore, loadLatestState } from "../persistence/store.ts";
import { PersistenceQueue } from "../persistence/queue.ts";
import { createEventHandlers, type AgentEventHandlers } from "./events.ts";
import { now } from "../utils/time.ts";
import debug from "debug";

const log = debug("agent");

import type { LLMCallFn, LLMResponse } from "../runtime/llm.ts";

export type AgentDeps = {
  systemPrompt: string;
  callLLM: LLMCallFn;
  callTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  tools?: Record<string, (input: Record<string, unknown>) => Promise<string>>;
  persistence?: {
    adapter?: AdapterOptions;
    enabled?: boolean;
  };
  createdAt?: number;
  eventHandlers?: AgentEventHandlers;
};

export type Agent = {
  dispatch(signal: Signal): void;
  getState(): AgentState;
  on(handler: (event: any) => void): () => void;
  close(): Promise<void>;
};

/**
 * 创建 Agent
 */
export const createAgent = async (deps: AgentDeps): Promise<Agent> => {
  log("Creating agent with system prompt:", deps.systemPrompt);
  
  // 初始化持久化
  let store: Awaited<ReturnType<typeof createStateStore>> | null = null;
  let queue: PersistenceQueue | null = null;
  let initialState: AgentState | undefined = undefined;
  
  if (deps.persistence?.enabled !== false) {
    log("Initializing persistence");
    const adapter = await createAdapter(deps.persistence?.adapter);
    store = await createStateStore(adapter);
    queue = new PersistenceQueue(store);
    
    // 尝试加载最新状态
    const latestState = await loadLatestState(store);
    if (latestState) {
      log("Loaded latest state from persistence");
      initialState = latestState;
      deps.createdAt = latestState.systemMessage.timestamp;
    }
  }
  
  // 创建状态机
  const machineDeps: AgentMachineDeps = {
    systemPrompt: deps.systemPrompt,
    callLLM: deps.callLLM,
    callTool: deps.callTool,
    createdAt: deps.createdAt,
    initialState,
  };
  
  const machine = createAgentMachine(machineDeps);
  
  // 设置事件处理器
  if (deps.eventHandlers) {
    const handler = createEventHandlers(deps.eventHandlers);
    machine.on(handler);
  }
  
  // 设置持久化事件处理器
  if (queue) {
    machine.on((event) => {
      if (event.type === "state-updated") {
        queue!.enqueue(event.state);
      }
    });
  }
  
  return {
    dispatch: (signal: Signal) => {
      log("Dispatching signal:", signal.kind);
      machine.dispatch(signal);
    },
    getState: () => {
      return machine.getState();
    },
    on: (handler: (event: any) => void) => {
      return machine.on(handler);
    },
    close: async () => {
      log("Closing agent");
      if (queue) {
        await queue.flush();
      }
      await closeAdapter();
    },
  };
};

