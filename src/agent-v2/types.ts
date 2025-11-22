import type { ActionDefinition } from "./moorex/agentState.ts";

/**
 * Model Provider 配置
 */
export type ModelProvider = {
  endpoint: string; // URL
  apiKey: string;
};

/**
 * Large Language Model 配置
 */
export type LargeLanguageModel = {
  provider: ModelProvider;
  model: string;
  temperature: number;
  topP: number;
};

/**
 * Action 定义（包含 run 函数）
 */
export type ActionWithRun = ActionDefinition & {
  run: (params: string) => Promise<string>;
};

/**
 * Reaction 选项
 */
export type ReactionOptions = {
  initialHistoryCount: number; // 初始的上下文消息条数 n
  additionalHistoryCount: number; // 每次追加的消息条数 m
};

/**
 * HStore Persistence Adapter
 */
export type PersistenceAdapter = {
  location?: string;
  createIfMissing?: boolean;
  compression?: boolean;
};

/**
 * CreateAgent 参数
 */
export type CreateAgentOptions = {
  systemPrompts: string;
  actions: Record<string, ActionWithRun>;
  thinkModel: LargeLanguageModel;
  speakModel: LargeLanguageModel;
  reaction?: ReactionOptions;
  persistence: {
    adapter: PersistenceAdapter;
  };
};


