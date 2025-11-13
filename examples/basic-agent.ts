import { createAgent, type UserMessage } from "../src/index.ts";
import { createId } from "../src/utils/id.ts";
import { now } from "../src/utils/time.ts";
import debug from "debug";

const log = debug("examples:basic-agent");

import type { LLMResponse } from "../src/runtime/llm.ts";

/**
 * 简单的 LLM 调用实现
 */
const callLLM = async (
  prompt: string,
  _messageWindow: ReadonlyArray<any>,
): Promise<LLMResponse> => {
  log("Calling LLM with prompt:", prompt);
  
  // 这里应该调用 OpenAI SDK
  // 目前返回一个模拟响应
  return {
    content: `LLM response to: ${prompt}`,
    // 可以包含工具调用：
    // toolCalls: [
    //   {
    //     id: "call_123",
    //     name: "get_weather",
    //     input: { location: "Beijing" },
    //   },
    // ],
  };
};

/**
 * 简单的工具调用实现
 */
const callTool = async (
  name: string,
  input: Record<string, unknown>,
): Promise<string> => {
  log("Calling tool:", name, "with input:", input);
  
  // 这里应该调用实际的工具
  // 目前返回一个模拟响应
  return JSON.stringify({ result: `Tool ${name} executed with input: ${input}` });
};

/**
 * 主函数
 */
const main = async () => {
  log("Creating agent");
  
  const agent = await createAgent({
    systemPrompt: "You are a helpful assistant.",
    callLLM,
    callTool,
    persistence: {
      enabled: true,
      adapter: {
        location: "./.data/leveldb",
      },
    },
    eventHandlers: {
      onSignalReceived: (signal) => {
        log("Signal received:", signal.kind);
      },
      onStateUpdated: (state) => {
        log("State updated, messages count:", state.messages.length);
      },
      onEffectStarted: (effect) => {
        log("Effect started:", effect.kind);
      },
      onEffectCompleted: (effect) => {
        log("Effect completed:", effect.kind);
      },
      onEffectFailed: (effect, error) => {
        log("Effect failed:", effect.kind, error);
      },
    },
  });
  
  log("Agent created, current state:", agent.getState());
  
  // 发送用户消息
  const userMessage: UserMessage = {
    id: createId(),
    kind: "user",
    content: "Hello, how are you?",
    timestamp: now(),
  };
  
  log("Dispatching user message");
  agent.dispatch(userMessage);
  
  // 等待一段时间让效果完成
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  log("Final state:", agent.getState());
  
  // 关闭 agent
  await agent.close();
  log("Agent closed");
};

// 运行主函数
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

