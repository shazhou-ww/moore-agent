import type { Immutable } from "mutative";
import type {
  Signal,
  AssistantMessage,
  AssistantToolCall,
  ToolMessage,
  UserMessage,
  AssistantChunkSignal,
  AssistantMessageCompleteSignal,
  AgentState,
} from "../types/schema.ts";
import type {
  Effect,
  CallLLMEffect,
  CallToolEffect,
  LLMCallFn,
  ToolCallFn,
} from "../types/effects.ts";
import { createId } from "../utils/id.ts";
import debug from "debug";

const log = debug("agent:runEffect");

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

// Chunk 合并配置
const CHUNK_QUEUE_SIZE_THRESHOLD = 100; // 当 queue 中的 chunk 内容超过这个长度时触发 signal

/**
 * 创建 LLM effect 的初始器
 */
const createLLMEffectInitializer = (
  effect: Immutable<CallLLMEffect>,
  callLLM: LLMCallFn,
) => {
  let canceled = false;
  const messageId = effect.key.replace("llm-", ""); // 从 key 中提取 messageId

  return {
    start: async (dispatch: (signal: Immutable<Signal>) => void) => {
      if (canceled) {
        return;
      }

      try {
        const prompt = effect.prompt || "";
        log("Calling LLM with prompt:", prompt);

        let chunkQueue: string[] = [];
        let totalLength = 0;
        let toolCalls: ReadonlyArray<{
          id: string;
          name: string;
          input: Record<string, unknown>;
        }> | undefined;

        // 发送 chunk 的函数，带合并逻辑
        const flushChunks = () => {
          if (chunkQueue.length > 0 && !canceled) {
            const mergedChunk = chunkQueue.join("");
            const chunkSignal: AssistantChunkSignal = {
              kind: "assistant-chunk",
              messageId,
              chunk: mergedChunk,
              timestamp: Date.now(),
            };
            dispatch(chunkSignal as Immutable<Signal>);
            chunkQueue = [];
            totalLength = 0;
          }
        };

        // 处理单个 chunk
        const handleChunk = (chunk: string) => {
          if (canceled) {
            return;
          }
          chunkQueue.push(chunk);
          totalLength += chunk.length;

          // 如果 queue 中的内容超过阈值，触发 signal
          if (totalLength >= CHUNK_QUEUE_SIZE_THRESHOLD) {
            flushChunks();
          }
        };

        // 处理完成
        const handleComplete = (
          completedToolCalls?: ReadonlyArray<{
            id: string;
            name: string;
            input: Record<string, unknown>;
          }>,
        ) => {
          if (canceled) {
            return;
          }

          // 先 flush 剩余的 chunks
          flushChunks();

          // 发送完成信号
          const completeSignal: AssistantMessageCompleteSignal = {
            kind: "assistant-complete",
            messageId,
            toolCalls: completedToolCalls
              ? convertToolCalls(completedToolCalls)
              : [],
            timestamp: Date.now(),
          };
          dispatch(completeSignal as Immutable<Signal>);
        };

        // 调用 streaming LLM
        await callLLM(prompt, Array.from(effect.messageWindow) as ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>, handleChunk, handleComplete);
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
  effect: Immutable<CallToolEffect>,
  callTool: ToolCallFn,
) => {
  let canceled = false;

  return {
    start: async (dispatch: (signal: Immutable<Signal>) => void) => {
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
          timestamp: Date.now(),
        };

        dispatch(toolMessage as Immutable<Signal>);
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
  const runEffect = (
    effect: Immutable<Effect>,
    state: Immutable<AgentState>,
  ) => {
    if (effect.kind === "call-llm") {
      return createLLMEffectInitializer(effect as Immutable<CallLLMEffect>, deps.callLLM);
    }

    if (effect.kind === "call-tool") {
      return createToolEffectInitializer(effect as Immutable<CallToolEffect>, deps.callTool);
    }

    // Exhaustiveness check
    const _exhaustive: never = effect;
    throw new Error(`Unknown effect kind: ${(_exhaustive as Effect).kind}`);
  };

  return runEffect;
};

