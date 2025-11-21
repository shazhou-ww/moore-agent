import type { Immutable } from "mutative";
import type { MoorexEvent } from "moorex";
import type { AgentState, Signal } from "../types/schema.ts";
import type { Effect } from "../types/effects.ts";

export type AgentEvent = MoorexEvent<AgentState, Signal, Effect>;

export type AgentEventType = AgentEvent["type"];

export type AgentEventHandlers = {
  onSignalReceived?: (signal: Immutable<Signal>) => void;
  onStateUpdated?: (state: Immutable<AgentState>) => void;
  onEffectStarted?: (effect: Immutable<Effect>) => void;
  onEffectCompleted?: (effect: Immutable<Effect>) => void;
  onEffectCanceled?: (effect: Immutable<Effect>) => void;
  onEffectFailed?: (effect: Immutable<Effect>, error: unknown) => void;
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
        handlers.onSignalReceived?.(event.signal as Immutable<Signal>);
        break;
      case "state-updated":
        handlers.onStateUpdated?.(event.state as Immutable<AgentState>);
        break;
      case "effect-started":
        handlers.onEffectStarted?.(event.effect as Immutable<Effect>);
        break;
      case "effect-completed":
        handlers.onEffectCompleted?.(event.effect as Immutable<Effect>);
        break;
      case "effect-canceled":
        handlers.onEffectCanceled?.(event.effect as Immutable<Effect>);
        break;
      case "effect-failed":
        handlers.onEffectFailed?.(event.effect as Immutable<Effect>, event.error);
        break;
    }
  };
};

