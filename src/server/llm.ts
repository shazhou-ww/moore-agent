import type { LLMCallFn, LLMChunkCallback, LLMCompleteCallback } from "../types/effects.ts";
import type { UserMessage, ToolMessage, AssistantMessage } from "../types/schema.ts";
import debug from "debug";

const log = debug("server:llm");

type LLMConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

/**
 * 解析 SSE 数据流
 */
const parseSSEChunk = (chunk: string): any[] => {
  const lines = chunk.split("\n");
  const events: any[] = [];
  let currentEvent: any = {};

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6);
      if (data === "[DONE]") {
        events.push({ done: true });
      } else {
        try {
          currentEvent = JSON.parse(data);
          events.push(currentEvent);
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }

  return events;
};

/**
 * 创建 LLM 调用函数 - 支持 streaming
 */
export const createLLMCallFn = (config: LLMConfig): LLMCallFn => {
  return async (
    prompt: string,
    messageWindow: ReadonlyArray<UserMessage | ToolMessage | AssistantMessage>,
    onChunk: LLMChunkCallback,
    onComplete: LLMCompleteCallback,
  ): Promise<void> => {
    log("Calling LLM with endpoint:", config.endpoint);

    if (!config.endpoint || !config.apiKey || !config.model) {
      throw new Error("LLM configuration is incomplete. Please set LLM_ENDPOINT, LLM_API_KEY, and LLM_MODEL environment variables.");
    }

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          messages: [
            ...messageWindow.map((msg) => ({
              role: msg.kind === "user" ? "user" : msg.kind === "assistant" ? "assistant" : "tool",
              content: msg.content,
            })),
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let toolCalls: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }> = [];

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = parseSSEChunk(buffer);
        
        // 处理完整的事件后，清空 buffer
        if (events.length > 0) {
          buffer = "";
        }

        for (const event of events) {
          if (event.done) {
            // Streaming 完成
            onComplete(toolCalls.length > 0 ? toolCalls : undefined);
            return;
          }

          // 处理 OpenAI 兼容格式
          if (event.choices && event.choices[0]) {
            const choice = event.choices[0];
            const delta = choice.delta;

            // 处理 content chunk
            if (delta?.content) {
              onChunk(delta.content);
            }

            // 处理 tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.index !== undefined) {
                  // 确保 toolCalls 数组足够大
                  while (toolCalls.length <= tc.index) {
                    toolCalls.push({ id: "", name: "", input: {} });
                  }

                  const toolCall = toolCalls[tc.index]!;
                  
                  if (tc.id) {
                    toolCall.id = tc.id;
                  }
                  
                  if (tc.function?.name) {
                    toolCall.name = tc.function.name;
                  }
                  
                  if (tc.function?.arguments) {
                    const args = typeof tc.function.arguments === "string"
                      ? tc.function.arguments
                      : JSON.stringify(tc.function.arguments);
                    toolCall.input = {
                      ...toolCall.input,
                      ...(typeof args === "string" ? JSON.parse(args) : args),
                    };
                  }
                }
              }
            }
          }
        }
      }

      // 如果正常结束，调用 onComplete
      onComplete(toolCalls.length > 0 ? toolCalls : undefined);
    } catch (error) {
      log("LLM call failed:", error);
      throw error;
    }
  };
};

