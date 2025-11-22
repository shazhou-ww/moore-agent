import {
  createLevelAdapter,
  type LevelAdapterOptions,
} from "@hstore/leveldb-adapter";
import { createStore, type Hash } from "@hstore/core";
import { createHash } from "crypto";
import { join } from "path";
import type { PersistenceAdapter } from "../types.ts";
import { agentStateSchema } from "../moorex/agentState.ts";
import {
  DEFAULT_LEVELDB_LOCATION,
  DEFAULT_CREATE_IF_MISSING,
  DEFAULT_COMPRESSION,
} from "../../config/defaults.ts";
import debug from "debug";

const log = debug("agent-v2:persistence");

/**
 * 创建 HStore 实例
 */
export const createPersistenceStore = async (
  adapterOptions: PersistenceAdapter,
  key: string,
) => {
  log("Initializing persistence with key:", key);

  const baseLocation = adapterOptions.location ?? DEFAULT_LEVELDB_LOCATION;
  const location = join(baseLocation, key);

  const levelAdapterOptions: LevelAdapterOptions = {
    location,
    createIfMissing:
      adapterOptions.createIfMissing ?? DEFAULT_CREATE_IF_MISSING,
    compression: adapterOptions.compression ?? DEFAULT_COMPRESSION,
  };

  const adapter = await createLevelAdapter(levelAdapterOptions);

  // 创建 HStore 实例
  const hashFn = (bytes: Uint8Array): Hash => {
    return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  };

  const store = await createStore({
    schema: agentStateSchema,
    adapter,
    hashFn,
  });

  log("Persistence store created");
  return { store, adapter };
};

