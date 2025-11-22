import type { ReactionOptions } from "./types.ts";

/**
 * Reaction 默认选项
 */
export const DEFAULT_REACTION_OPTIONS: ReactionOptions = {
  initialHistoryCount: 10,
  additionalHistoryCount: 5,
};

/**
 * Persistence 默认 debounce 延迟时间（毫秒）
 */
export const DEFAULT_PERSISTENCE_DEBOUNCE_DELAY = 2000;

