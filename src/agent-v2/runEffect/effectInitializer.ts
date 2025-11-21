import type { Immutable } from "mutative";
import type { AgentSignal } from "../agentSignal.ts";
import type { EffectInitializer } from "./types.ts";

/**
 * Dispatch 函数类型
 */
export type Dispatch = (signal: Immutable<AgentSignal>) => void;

/**
 * 创建 EffectInitializer 的通用辅助函数
 * 处理常见的 cancel 变量模式
 */
export const createEffectInitializer = (
  start: (dispatch: Dispatch, isCancelled: () => boolean) => Promise<void>,
  onCancel: () => void = () => {},
): EffectInitializer => {
  let canceled = false;

  return {
    start: async (dispatch: Dispatch) => {
      try {
        if (!canceled) {
          await start(dispatch, () => canceled);
        }
      } catch (error) {
        console.warn("Effect failed:", error);
      }
    },
    cancel: () => {
      canceled = true;
      onCancel();
    },
  };
};

