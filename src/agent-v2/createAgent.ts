import type { Immutable } from "mutative";
import type { AgentState } from "./moorex/agentState.ts";
import type { AgentSignal, UserMessageReceivedSignal } from "./moorex/agentSignal.ts";
import { createAgentMoorex } from "./moorex/index.ts";
import { createThinkFn, createSpeakFn } from "./adapters/llm.ts";
import { createActFn } from "./adapters/actions.ts";
import { createPersistenceStore } from "./adapters/persistence.ts";
import type { CreateAgentOptions } from "./types.ts";
import type { Agent } from "./types.ts";
import type { RunEffectOptions } from "./moorex/runEffect/types.ts";
import { DEFAULT_REACTION_OPTIONS, DEFAULT_PERSISTENCE_DEBOUNCE_DELAY } from "./constants.ts";
import { loadOrCreateInitialState } from "./state.ts";
import { validateKey } from "./validation.ts";
import { createId } from "../utils/id.ts";
import { debounce } from "lodash";
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

  // 设置持久化事件处理器（带 debounce）
  let lastState: Immutable<AgentState> | null = null;
  
  // 获取 debounce 延迟时间，使用配置值或默认值
  const debounceDelay = options.persistence.debounceDelay ?? DEFAULT_PERSISTENCE_DEBOUNCE_DELAY;
  
  // 创建 debounced 保存函数
  const debouncedSave = debounce((state: Immutable<AgentState>) => {
    store.commit(state).catch((error) => {
      log("Error saving state:", error);
    });
  }, debounceDelay);

  machine.on((event) => {
    if (event.type === "state-updated") {
      lastState = event.state;
      // 调用 debounced 保存函数
      debouncedSave(lastState);
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
      return machine.getState();
    },
    on: (handler) => {
      return machine.on(handler as any);
    },
    close: async () => {
      log("Closing agent");
      // 取消待执行的 debounce 调用
      debouncedSave.cancel();
      // 保存最后的状态
      if (lastState) {
        await store.commit(lastState);
      }
      await adapter.close();
    },
  };
};

