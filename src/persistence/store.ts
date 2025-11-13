import { createStore, type HStore, type Hash } from "@hstore/core";
import type { AgentState } from "../types/state.ts";
import { agentStateSchema } from "../types/schema.ts";
import type { LevelAdapter } from "@hstore/leveldb-adapter";
import { createHash } from "crypto";
import debug from "debug";

const log = debug("agent:persistence:store");

/**
 * 使用 SHA-256 作为哈希函数
 * 注意：根据计划应使用 murmurhash，但当前使用 SHA-256 作为替代
 * TODO: 替换为 murmurhash 实现
 */
const hashFn = (bytes: Uint8Array): Hash => {
  // 使用 Node.js 的 crypto 模块计算 SHA-256 哈希
  // 注意：murmurhash 可能不支持 Uint8Array，需要使用 Buffer
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
};

/**
 * 创建 HStore 实例
 */
export const createStateStore = async (
  adapter: LevelAdapter,
): Promise<HStore<AgentState>> => {
  log("Creating state store");
  
  // 注意：hstore 使用 zod 3，但我们需要使用 zod 4
  // 这里可能需要调整 schema
  const store = await createStore({
    schema: agentStateSchema,
    adapter,
    hashFn,
  });
  
  return store;
};

/**
 * 加载最新状态
 */
export const loadLatestState = async (
  store: HStore<AgentState>,
): Promise<AgentState | null> => {
  log("Loading latest state");
  
  const head = await store.head();
  
  if (!head) {
    log("No head found, returning null");
    return null;
  }
  
  log("Loaded state from head:", head.hash);
  return head.value;
};

/**
 * 根据 hash 加载状态
 */
export const loadStateByHash = async (
  store: HStore<AgentState>,
  hash: Hash,
): Promise<AgentState | null> => {
  log("Loading state by hash:", hash);
  
  const version = await store.get(hash);
  
  if (!version) {
    log("No state found for hash:", hash);
    return null;
  }
  
  return version.value;
};

/**
 * 追加状态
 */
export const appendState = async (
  store: HStore<AgentState>,
  state: AgentState,
): Promise<{ hash: Hash; timestamp: number }> => {
  log("Appending state");
  
  const version = await store.commit(state);
  
  log("State committed, hash:", version.hash, "timestamp:", version.timestamp);
  
  return {
    hash: version.hash,
    timestamp: version.timestamp,
  };
};

