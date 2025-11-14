import type { LLMCallFn, LLMResponse } from "../types/effects.ts";
import type { Signal } from "../types/schema.ts";
import debug from "debug";

const log = debug("server:llm");

type LLMConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

/**
 * 创建 LLM 调用函数
 */
export const createLLMCallFn = (config: LLMConfig): LLMCallFn => {
  return async (
    prompt: string,
    messageWindow: ReadonlyArray<Signal>,
  ): Promise<LLMResponse> => {
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

      const data = await response.json();

      // 处理 OpenAI 兼容格式
      if (data.choices && data.choices[0]) {
        const choice = data.choices[0];
        const message = choice.message || choice.delta;

        return {
          content: message.content || "",
          toolCalls: message.tool_calls?.map((tc: any) => ({
            id: tc.id,
            name: tc.function?.name || "",
            input: typeof tc.function?.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function?.arguments || {},
          })),
        };
      }

      // 处理其他格式
      return {
        content: data.content || data.text || "",
        toolCalls: data.toolCalls || data.tool_calls,
      };
    } catch (error) {
      log("LLM call failed:", error);
      throw error;
    }
  };
};

