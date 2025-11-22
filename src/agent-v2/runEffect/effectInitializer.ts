import type { Immutable } from "mutative";
import type { AgentSignal } from "../agentSignal.ts";
import type { EffectInitializer } from "./types.ts";

/**
 * Dispatch 函数类型
 */
export type Dispatch = (signal: Immutable<AgentSignal>) => void;

/**
 * Effect 生命周期回调
 */
export type EffectCallbacks = {
  onCancel?: () => void;
  onError?: (error: unknown) => void;
};

/**
 * 创建 EffectInitializer 的通用辅助函数
 * 处理常见的 cancel 变量模式
 */
export const createEffectInitializer = (
  start: (dispatch: Dispatch, isCancelled: () => boolean) => Promise<void>,
  callbacks: EffectCallbacks = {},
): EffectInitializer => {
  const { onCancel = () => {}, onError = () => {} } = callbacks;
  let canceled = false;

  return {
    start: async (dispatch: Dispatch) => {
      try {
        if (!canceled) {
          await start(dispatch, () => canceled);
        }
      } catch (error) {
        onError(error);
      }
    },
    cancel: () => {
      canceled = true;
      onCancel();
    },
  };
};

