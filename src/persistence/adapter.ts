import { createLevelAdapter, type LevelAdapter } from "@hstore/leveldb-adapter";
import type { LevelAdapterOptions } from "@hstore/leveldb-adapter";
import {
  DEFAULT_LEVELDB_LOCATION,
  DEFAULT_CREATE_IF_MISSING,
  DEFAULT_COMPRESSION,
} from "../config/defaults.ts";
import debug from "debug";

const log = debug("agent:persistence:adapter");

let adapterInstance: LevelAdapter | null = null;

export type AdapterOptions = Partial<LevelAdapterOptions>;

/**
 * 创建 LevelDB 适配器
 */
export const createAdapter = async (
  options?: AdapterOptions,
): Promise<LevelAdapter> => {
  if (adapterInstance) {
    log("Reusing existing adapter instance");
    return adapterInstance;
  }
  
  const config: LevelAdapterOptions = {
    location: options?.location ?? DEFAULT_LEVELDB_LOCATION,
    createIfMissing: options?.createIfMissing ?? DEFAULT_CREATE_IF_MISSING,
    compression: options?.compression ?? DEFAULT_COMPRESSION,
  };
  
  log("Creating LevelDB adapter:", config);
  
  adapterInstance = await createLevelAdapter(config);
  
  return adapterInstance;
};

/**
 * 关闭适配器
 */
export const closeAdapter = async (): Promise<void> => {
  if (adapterInstance) {
    log("Closing adapter");
    await adapterInstance.close();
    adapterInstance = null;
  }
};

/**
 * 清理适配器（测试用）
 */
export const clearAdapter = async (): Promise<void> => {
  if (adapterInstance) {
    log("Clearing adapter");
    await adapterInstance.clear();
    adapterInstance = null;
  }
};

/**
 * 获取当前适配器实例（如果已创建）
 */
export const getAdapter = (): LevelAdapter | null => {
  return adapterInstance;
};

