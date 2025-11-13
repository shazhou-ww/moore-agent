import type {
  Signal,
  AssistantMessage,
  AssistantToolCall,
  ToolMessage,
} from "../types/schema.ts";
import type {
  Effect,
  CallLLMEffect,
  CallToolEffect,
  LLMResponse,
  LLMCallFn,
  ToolCallFn,
} from "../types/effects.ts";
import { createId } from "../utils/id.ts";
import { now } from "../utils/time.ts";
import debug from "debug";

const log = debug("agent:runEffect");

/**
 * 构建 prompt
 */
const buildPrompt = (messageWindow: ReadonlyArray<Signal>): string => {
  return messageWindow.map((msg) => `${msg.kind}: ${msg.content}`).join("\n");
};

/**
 * 转换工具调用为 AssistantToolCall 格式
 */
const convertToolCalls = (
  toolCalls: ReadonlyArray<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>,
): AssistantToolCall[] => {
  return toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.name,
    input: JSON.stringify(tc.input),
  }));
};

type RunEffectDeps = {
  callLLM: LLMCallFn;
  callTool: ToolCallFn;
};

/**
 * 创建 LLM effect 的初始器
 */
const createLLMEffectInitializer = (
  effect: CallLLMEffect,
  callLLM: LLMCallFn,
) => {
  let canceled = false;

  return {
    start: async (dispatch: (signal: Signal) => void) => {
      if (canceled) {
        return;
      }

      try {
        const prompt = effect.prompt || buildPrompt(effect.messageWindow);
        log("Calling LLM with prompt:", prompt);

        const response: LLMResponse = await callLLM(prompt, effect.messageWindow);

        if (canceled) {
          return;
        }

        const toolCalls = response.toolCalls
          ? convertToolCalls(response.toolCalls)
          : [];

        const assistantMessage: AssistantMessage = {
          id: createId(),
          kind: "assistant",
          content: response.content,
          toolCalls,
          timestamp: now(),
        };

        log("Dispatching assistant message with tool calls:", toolCalls.length);
        dispatch(assistantMessage);
      } catch (error) {
        if (!canceled) {
          log("LLM call failed:", error);
          throw error;
        }
      }
    },
    cancel: () => {
      canceled = true;
    },
  };
};

/**
 * 创建 Tool effect 的初始器
 */
const createToolEffectInitializer = (
  effect: CallToolEffect,
  callTool: ToolCallFn,
) => {
  let canceled = false;

  return {
    start: async (dispatch: (signal: Signal) => void) => {
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

/**
 * 创建 runEffect 函数
 */
export const createRunEffect = (deps: RunEffectDeps) => {
  const runEffect = (effect: Effect) => {
    if (effect.kind === "call-llm") {
      return createLLMEffectInitializer(effect, deps.callLLM);
    }

    if (effect.kind === "call-tool") {
      return createToolEffectInitializer(effect, deps.callTool);
    }

    // Exhaustiveness check
    const _exhaustive: never = effect;
    throw new Error(`Unknown effect kind: ${(_exhaustive as Effect).kind}`);
  };

  return runEffect;
};

