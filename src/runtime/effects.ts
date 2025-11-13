import type { Signal } from "../types/state.ts";
import type { Effect } from "../types/effects.ts";
import { runLLMEffect, type LLMCallFn } from "./llm.ts";
import { runToolEffect, type ToolCallFn } from "./tools.ts";

export type CancelFn = () => void;

export type EffectInitializer<S> = {
  start: (dispatch: (signal: S) => void) => Promise<void>;
  cancel: CancelFn;
};

/**
 * 运行效果
 */
export const runEffect = (
  effect: Effect,
  deps: {
    callLLM: LLMCallFn;
    callTool: ToolCallFn;
  },
): EffectInitializer<Signal> => {
  if (effect.kind === "call-llm") {
    return runLLMEffect(effect, deps.callLLM);
  }
  
  if (effect.kind === "call-tool") {
    return runToolEffect(effect, deps.callTool);
  }
  
  // Exhaustiveness check
  const _exhaustive: never = effect;
  throw new Error(`Unknown effect kind: ${(_exhaustive as Effect).kind}`);
};

