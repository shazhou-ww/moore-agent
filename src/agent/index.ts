import type { AgentState, UserMessage } from "../types/schema.ts";
import { createAgentMachine, type AgentMachineDeps } from "../state/machine.ts";
import {
  createLevelAdapter,
  type LevelAdapter,
  type LevelAdapterOptions,
} from "@hstore/leveldb-adapter";
import { createStore, type HStore, type Hash, type JsonValue } from "@hstore/core";
import {
  DEFAULT_LEVELDB_LOCATION,
  DEFAULT_CREATE_IF_MISSING,
  DEFAULT_COMPRESSION,
} from "../config/defaults.ts";
import { agentStateSchema } from "../types/schema.ts";
import { createHash } from "crypto";
import { createEventHandlers, type AgentEventHandlers, type AgentEvent } from "./events.ts";
import { createId } from "../utils/id.ts";
import { now } from "../utils/time.ts";
import debug from "debug";
import type { LLMCallFn } from "../runtime/llm.ts";

const log = debug("agent");

export type AgentDeps = {
  systemPrompt: string;
  callLLM: LLMCallFn;
  callTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  persistence?: {
    adapter?: Partial<LevelAdapterOptions>;
  };
  createdAt?: number;
  eventHandlers?: AgentEventHandlers;
};

export type Agent = {
  sendMessage(content: string): void;
  getState(): AgentState;
  on(handler: (event: AgentEvent) => void): () => void;
  close(): Promise<void>;
};

/**
 * 创建 Agent
 */
export const createAgent = async (deps: AgentDeps): Promise<Agent> => {
  log("Creating agent with system prompt:", deps.systemPrompt);
  
  // 初始化持久化（始终启用）
  log("Initializing persistence");
  const adapterOptions: LevelAdapterOptions = {
    location: deps.persistence?.adapter?.location ?? DEFAULT_LEVELDB_LOCATION,
    createIfMissing:
      deps.persistence?.adapter?.createIfMissing ?? DEFAULT_CREATE_IF_MISSING,
    compression:
      deps.persistence?.adapter?.compression ?? DEFAULT_COMPRESSION,
  };
  const adapter = await createLevelAdapter(adapterOptions);
  
  // 创建 HStore 实例
  const hashFn = (bytes: Uint8Array): Hash => {
    return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  };
  
  const store = await createStore({
    schema: agentStateSchema,
    adapter,
    hashFn,
  });
  
  // 尝试加载最新状态
  let initialState: AgentState | undefined = undefined;
  const head = await store.head();
  if (head && head.value) {
    log("Loaded latest state from persistence");
    initialState = head.value as unknown as AgentState;
    deps.createdAt = (head.value as unknown as AgentState).systemMessage.timestamp;
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
  
  // 设置持久化事件处理器（只保存最后的状态）
  let lastState: AgentState | null = null;
  machine.on((event) => {
    if (event.type === "state-updated") {
      lastState = event.state;
      // 异步保存，不阻塞事件处理
      store.commit(event.state).catch((error) => {
        log("Error saving state:", error);
      });
    }
  });
  
  return {
    sendMessage: (content: string) => {
      log("Sending user message:", content);
      
      const userMessage: UserMessage = {
        id: createId(),
        kind: "user",
        content,
        timestamp: now(),
      };
      
      machine.dispatch(userMessage);
    },
    getState: () => {
      return machine.getState();
    },
    on: (handler: (event: AgentEvent) => void) => {
      return machine.on(handler);
    },
    close: async () => {
      log("Closing agent");
      // 保存最后的状态
      if (lastState) {
        await store.commit(lastState as any);
      }
      await adapter.close();
    },
  };
};

