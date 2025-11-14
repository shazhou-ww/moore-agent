import type { AgentState, Signal, UserMessage } from "../types/schema.ts";
import { createMoorex } from "moorex";
import {
  createLevelAdapter,
  type LevelAdapterOptions,
} from "@hstore/leveldb-adapter";
import { createStore, freezeJson, type Hash, type FrozenJson } from "@hstore/core";
import {
  DEFAULT_LEVELDB_LOCATION,
  DEFAULT_CREATE_IF_MISSING,
  DEFAULT_COMPRESSION,
} from "../config/defaults.ts";
import { agentStateSchema } from "../types/schema.ts";
import { createHash } from "crypto";
import type { AgentEvent } from "./events.ts";
import { createId } from "../utils/id.ts";
import { before, now } from "../utils/time.ts";
import debug from "debug";
import type { Effect, LLMCallFn, ToolCallFn } from "../types/effects.ts";
import { transition } from "./transition.ts";
import { effectsAt } from "./effects.ts";
import { createRunEffect } from "./runEffect.ts";

const log = debug("agent");

export type AgentDeps = {
  systemPrompt: string;
  callLLM: LLMCallFn;
  callTool: ToolCallFn;
  persistence?: {
    adapter?: Partial<LevelAdapterOptions>;
  };
};

export type Agent = {
  sendMessage(userMessage: UserMessage): void;
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
  const loadInitialState = async () => {
    const head = await store.head();
    return head?.value ?? freezeJson({
      systemMessage: {
        id: createId(),
        kind: "system",
        content: deps.systemPrompt,
        timestamp: now(),
      },
      messages: [],
      partialMessage: null,
      lastSentToLLMAt: before(now(), 1),
    } as AgentState);
  }
  const initialState: FrozenJson<AgentState> = await loadInitialState();

  // 创建 runEffect 函数
  const runEffect = createRunEffect({
    callLLM: deps.callLLM,
    callTool: deps.callTool,
  });

  const machine = createMoorex<FrozenJson<AgentState>, Signal, Effect>({
    initialState,
    transition,
    effectsAt,
    runEffect,
  });
  
  // 设置持久化事件处理器（只保存最后的状态）
  let lastState: AgentState | null = null;
  machine.on((event) => {
    if (event.type === "state-updated") {
      lastState = event.state as unknown as AgentState;
      // 异步保存，不阻塞事件处理
      store.commit(event.state as any).catch((error) => {
        log("Error saving state:", error);
      });
    }
  });
  
  return {
    sendMessage: (userMessage: UserMessage) => {
      log("Sending user message:", userMessage.id, userMessage.content);
      machine.dispatch(userMessage);
    },
    getState: () => {
      return machine.getState() as unknown as AgentState;
    },
    on: (handler: (event: AgentEvent) => void) => {
      return machine.on(handler as any);
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

