import type { Immutable } from "mutative";
import type { AgentState } from "./moorex/agentState.ts";
import type { AgentSignal, UserMessageReceivedSignal } from "./moorex/agentSignal.ts";
import { createAgentMoorex } from "./moorex/index.ts";
import { createThinkFn, createSpeakFn } from "./adapters/llm.ts";
import { createActFn } from "./adapters/actions.ts";
import { createPersistenceStore } from "./adapters/persistence.ts";
import type { CreateAgentOptions, ActionWithRun } from "./types.ts";
import type { Agent } from "./types.ts";
import type { RunEffectOptions } from "./moorex/runEffect/types.ts";
import { DEFAULT_REACTION_OPTIONS } from "./constants.ts";
import { createInitialAgentState, loadOrCreateInitialState } from "./state.ts";
import { validateKey } from "./validation.ts";
import { createId } from "../utils/id.ts";
import debug from "debug";

const log = debug("agent-v2");

/**
 * 创建 Agent
 */
export const createAgent = async (
  key: string,
  options: CreateAgentOptions,
): Promise<Agent> => {
  // 验证 key 是否为有效的 UUID
  validateKey(key);

  log("Creating agent with key:", key);
  log("Creating agent with system prompts:", options.systemPrompts);
  log("Actions count:", Object.keys(options.actions).length);

  // 初始化持久化
  const { store, adapter } = await createPersistenceStore(
    options.persistence.adapter,
    key,
  );

  // 加载或创建初始状态
  const initialState = await loadOrCreateInitialState(
    store,
    options.systemPrompts,
    options.actions,
  );

  // 创建行为函数
  const think = createThinkFn(options.thinkModel);
  const speak = createSpeakFn(options.speakModel);
  const act = createActFn(options.actions);

  // 创建 RunEffectOptions
  const reactionOptions = options.reaction ?? DEFAULT_REACTION_OPTIONS;
  const runEffectOptions: RunEffectOptions = {
    behavior: {
      think,
      speak,
      act,
    },
    options: {
      reaction: reactionOptions,
    },
  };

  // 创建 AgentMoorex 实例
  const machine = createAgentMoorex(runEffectOptions, initialState);

  // 设置持久化事件处理器
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
    sendMessage: (content: string) => {
      log("Sending user message:", content);
      const messageId = createId();
      const signal: UserMessageReceivedSignal = {
        kind: "user-message-received",
        messageId,
        content,
        timestamp: Date.now(),
      };
      machine.dispatch(signal as Immutable<AgentSignal>);
    },
    getState: () => {
      return machine.getState() as unknown as AgentState;
    },
    on: (handler) => {
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

