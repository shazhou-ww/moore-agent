import type { Signal, ToolMessage } from "../types/schema.ts";
import type { CallToolEffect } from "../types/effects.ts";
import type { EffectInitializer } from "./effects.ts";
import { createId } from "../utils/id.ts";
import { now } from "../utils/time.ts";
import debug from "debug";

const log = debug("agent:tools");

export type ToolCallFn = (
  name: string,
  input: Record<string, unknown>,
) => Promise<string>;

/**
 * 运行工具效果
 */
export const runToolEffect = (
  effect: CallToolEffect,
  callTool: ToolCallFn,
): EffectInitializer<Signal> => {
  let canceled = false;
  
  return {
    start: async (dispatch) => {
      if (canceled) {
        return;
      }
      
      try {
        log("Calling tool:", effect.call.name, "with input:", effect.call.input);
        
        const result = await callTool(effect.call.name, effect.call.input);
        
        if (canceled) {
          return;
        }
        
        const toolMessage: ToolMessage = {
          id: createId(),
          kind: "tool",
          content: result,
          callId: effect.call.id,
          timestamp: now(),
        };
        
        dispatch(toolMessage);
      } catch (error) {
        if (!canceled) {
          log("Tool call failed:", error);
          throw error;
        }
      }
    },
    cancel: () => {
      canceled = true;
    },
  };
};

