import OpenAI from "openai";
import { map, compact } from "lodash";
import type { LargeLanguageModel } from "../types.ts";
import type { ThinkFn, SpeakFn } from "../moorex/runEffect/types.ts";
import type { HistoryMessage, Action } from "../moorex/agentState.ts";
import debug from "debug";

const log = debug("agent-v2:llm");

/**
 * 创建 ThinkFn（非流式调用，返回 JSON 字符串）
 */
export const createThinkFn = (model: LargeLanguageModel): ThinkFn => {
  const client = new OpenAI({
    baseURL: model.provider.endpoint,
    apiKey: model.provider.apiKey,
  });

  return async (
    getSystemPrompts: (funcName: string) => string,
    messageWindow: HistoryMessage[],
    outputSchema: Record<string, unknown>,
  ): Promise<string> => {
    log("Calling think model:", model.model);
    log("Message window size:", messageWindow.length);

    try {
      // 构建消息列表
      const systemPrompt = getSystemPrompts("think");
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = compact([
        systemPrompt && {
          role: "system",
          content: systemPrompt,
        },
        ...map(messageWindow, (msg) => ({
          role: msg.type === "user" ? "user" : "assistant",
          content: msg.content,
        })),
      ]) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

      // 调用 OpenAI API（非流式）
      const response = await client.chat.completions.create({
        model: model.model,
        messages,
        temperature: model.temperature,
        top_p: model.topP,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "response",
            schema: outputSchema,
            strict: true,
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from think model");
      }

      log("Think model response received");
      return content;
    } catch (error) {
      log("Think model call failed:", error);
      throw error;
    }
  };
};

/**
 * 创建 SpeakFn（流式调用，返回 chunk 流）
 */
export const createSpeakFn = (model: LargeLanguageModel): SpeakFn => {
  const client = new OpenAI({
    baseURL: model.provider.endpoint,
    apiKey: model.provider.apiKey,
  });

  return async (
    systemPrompts: string,
    messageWindow: HistoryMessage[],
    relatedActions: Record<string, Action>,
    sentContent: string,
  ): Promise<AsyncGenerator<string>> => {
    log("Calling speak model:", model.model);
    log("Message window size:", messageWindow.length);
    log("Related actions count:", Object.keys(relatedActions).length);

    try {
      // 如果有已发送的内容，构建接续提示
      const continuationPrompt = sentContent
        ? `
You are a model that is resuming a previously interrupted generation.

Below is the content you have already generated (partial output):

=== BEGIN PARTIAL OUTPUT ===
${sentContent}
=== END PARTIAL OUTPUT ===

Continue generating the text from after the END PARTIAL OUTPUT.
Do not repeat any sentences from the partial output.
Do not rewrite or modify the existing content.
Do not explain anything. Just continue the text directly.
`
        : null;

      // 合并 system prompts：如果有接续提示，将其添加到 system prompts 前面
      const finalSystemPrompts = continuationPrompt
        ? `${continuationPrompt}\n\n${systemPrompts}`
        : systemPrompts;

      // 构建消息列表
      const actionsContext =
        Object.keys(relatedActions).length > 0
          ? map(relatedActions, (action, id) => {
              const params = action.parameter
                ? JSON.parse(action.parameter)
                : null;
              const result =
                action.response?.type === "completed"
                  ? action.response.result
                  : null;
              return `Action ${id} (${action.request.actionName}): ${action.request.intention}${params ? `\nParameters: ${JSON.stringify(params)}` : ""}${result ? `\nResult: ${result}` : ""}`;
            }).join("\n\n")
          : null;

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = compact([
        finalSystemPrompts && {
          role: "system",
          content: finalSystemPrompts,
        },
        ...map(messageWindow, (msg) => ({
          role: msg.type === "user" ? "user" : "assistant",
          content: msg.content,
        })),
        actionsContext && {
          role: "user",
          content: `Related actions context:\n${actionsContext}`,
        },
      ]) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

      // 调用 OpenAI API（流式）
      const stream = await client.chat.completions.create({
        model: model.model,
        messages,
        temperature: model.temperature,
        top_p: model.topP,
        stream: true,
      });

      // 返回异步生成器
      return (async function* () {
        // 流式返回 chunks
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            yield content;
          }
        }

        log("Speak model stream completed");
      })();
    } catch (error) {
      log("Speak model call failed:", error);
      throw error;
    }
  };
};

