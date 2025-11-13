import type { MoorexEvent } from "moorex";
import type { AgentState } from "../types/state.ts";
import type { Signal } from "../types/state.ts";
import type { Effect } from "../types/effects.ts";

export type AgentEvent = MoorexEvent<AgentState, Signal, Effect>;

export type AgentEventType = AgentEvent["type"];

export type AgentEventHandlers = {
  onSignalReceived?: (signal: Signal) => void;
  onStateUpdated?: (state: AgentState) => void;
  onEffectStarted?: (effect: Effect) => void;
  onEffectCompleted?: (effect: Effect) => void;
  onEffectCanceled?: (effect: Effect) => void;
  onEffectFailed?: (effect: Effect, error: unknown) => void;
};

/**
 * 创建事件处理器
 */
export const createEventHandlers = (
  handlers: AgentEventHandlers,
): (event: AgentEvent) => void => {
  return (event: AgentEvent) => {
    switch (event.type) {
      case "signal-received":
        handlers.onSignalReceived?.(event.signal);
        break;
      case "state-updated":
        handlers.onStateUpdated?.(event.state);
        break;
      case "effect-started":
        handlers.onEffectStarted?.(event.effect);
        break;
      case "effect-completed":
        handlers.onEffectCompleted?.(event.effect);
        break;
      case "effect-canceled":
        handlers.onEffectCanceled?.(event.effect);
        break;
      case "effect-failed":
        handlers.onEffectFailed?.(event.effect, event.error);
        break;
    }
  };
};

