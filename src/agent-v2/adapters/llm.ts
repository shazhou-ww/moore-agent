import OpenAI from "openai";
import type { LargeLanguageModel } from "../types.ts";
import type { ThinkFn, SpeakFn, ToolDefinition, ToolCall } from "../moorex/runEffect/types.ts";
import type { HistoryMessage } from "../moorex/agentState.ts";
import debug from "debug";

const log = debug("agent-v2:llm");
const INFO_TOOL_PREFIX = "info_";

const prefixToolName = (name: string): string => `${INFO_TOOL_PREFIX}${name}`;

const buildSupplementalTools = (
  toolDefinitions: Record<string, ToolDefinition>,
): OpenAI.Chat.Completions.ChatCompletionTool[] =>
  Object.entries(toolDefinitions).map(([name, definition]) => ({
    type: "function",
    function: {
      name: prefixToolName(name),
      description: definition.description,
      parameters: definition.schema,
    },
  }));

const parseJsonSafely = (input: string | null | undefined): unknown => {
  if (!input) {
    return undefined;
  }
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
};

const buildToolCallArguments = (toolCall: ToolCall): string => {
  const parsedParameters = parseJsonSafely(toolCall.parameters);
  if (parsedParameters === undefined) {
    return "{}";
  }
  return typeof parsedParameters === "string"
    ? parsedParameters
    : JSON.stringify(parsedParameters);
};

const buildAssistantToolCallMessage = (
  callId: string,
  toolCall: ToolCall,
): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
  const content =
    toolCall.parameters && toolCall.parameters.trim().length > 0
      ? toolCall.parameters
      : null;
  return {
    role: "assistant",
    content,
    tool_calls: [
      {
        id: callId,
        type: "function",
        function: {
          name: prefixToolName(toolCall.name),
          arguments: buildToolCallArguments(toolCall),
        },
      },
    ],
  };
};

const buildToolResultMessage = (
  callId: string,
  toolCall: ToolCall,
): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
  role: "tool",
  content: toolCall.result || "",
  tool_call_id: callId,
});

const buildConversationMessages = (
  messageWindow: HistoryMessage[],
  toolCalls: Record<string, ToolCall>,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] => {
  type TimelineEntry = {
    timestamp: number;
    order: number;
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam;
  };

  const timeline: TimelineEntry[] = messageWindow.map((msg, index) => ({
    timestamp: msg.timestamp,
    order: index,
    message: {
      role: msg.type === "user" ? "user" : "assistant",
      content: msg.content,
    },
  }));

  let orderCounter = timeline.length;
  Object.entries(toolCalls)
    .sort((a, b) => {
      if (a[1].requestedAt === b[1].requestedAt) {
        return a[0].localeCompare(b[0]);
      }
      return a[1].requestedAt - b[1].requestedAt;
    })
    .forEach(([callId, call]) => {
      timeline.push({
        timestamp: call.requestedAt,
        order: orderCounter++,
        message: buildAssistantToolCallMessage(callId, call),
      });
      timeline.push({
        timestamp: call.respondedAt,
        order: orderCounter++,
        message: buildToolResultMessage(callId, call),
      });
    });

  return timeline
    .sort((a, b) => {
      if (a.timestamp === b.timestamp) {
        return a.order - b.order;
      }
      return a.timestamp - b.timestamp;
    })
    .map((entry) => entry.message);
};

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
    tools: Record<string, ToolDefinition>,
    toolCalls: Record<string, ToolCall>,
    outputSchema: Record<string, unknown>,
  ): Promise<string> => {
    log("Calling think model:", model.model);
    log("message window size:", messageWindow.length);
    log("supplemental tools:", Object.keys(tools).length);
    log("supplemental tool calls:", Object.keys(toolCalls).length);

    try {
      // 构建消息列表
      const systemPrompt = getSystemPrompts("think");
      const conversationMessages = buildConversationMessages(messageWindow, toolCalls);
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      if (systemPrompt) {
        messages.push({
          role: "system",
          content: systemPrompt,
        });
      }
      messages.push(...conversationMessages);

      // 定义 tool，使用 outputSchema 作为参数 schema
      const supplementalTools = buildSupplementalTools(tools);
      const requestTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        {
          type: "function",
          function: {
            name: "think",
            description: "Return the decision result in the specified format",
            parameters: outputSchema,
          },
        },
        ...supplementalTools,
      ];
      // 调用 OpenAI API（非流式），使用 tool_choice 强制调用函数
      const response = await client.chat.completions.create({
        model: model.model,
        messages,
        temperature: model.temperature,
        top_p: model.topP,
        tools: requestTools,
        tool_choice: { type: "function", function: { name: "think" } },
      });
      // log("response", response);

      // 从 tool call 中提取结果
      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        throw new Error("No tool call in response");
      }
      
      // 检查 tool call 类型并提取参数
      if (toolCall.type !== "function") {
        throw new Error("Expected function tool call but got: " + toolCall.type);
      }
      
      if (toolCall.function.name !== "think") {
        throw new Error("Expected tool call 'think' but got: " + toolCall.function.name);
      }

      const content = toolCall.function.arguments;
      if (!content) {
        throw new Error("Empty arguments from think tool call");
      }

      log("Think model response received, content:", content);
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
    tools: Record<string, ToolDefinition>,
    toolCalls: Record<string, ToolCall>,
    sentContent: string,
  ): Promise<AsyncGenerator<string>> => {
    log("Calling speak model:", model.model);
    log("Message window size:", messageWindow.length);
    log("supplemental tools:", Object.keys(tools).length);
    log("supplemental tool calls:", Object.keys(toolCalls).length);

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
      const conversationMessages = buildConversationMessages(messageWindow, toolCalls);
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      if (finalSystemPrompts) {
        messages.push({
          role: "system",
          content: finalSystemPrompts,
        });
      }
      messages.push(...conversationMessages);

      log("Messages:\n\n", JSON.stringify(messages, null, 2));
      console.log("messages.length", messages.length);

      const supplementalTools = buildSupplementalTools(tools);

      // 调用 OpenAI API（流式）
      const stream = await client.chat.completions.create({
        model: model.model,
        messages,
        temperature: model.temperature,
        top_p: model.topP,
        tools: supplementalTools.length > 0 ? supplementalTools : undefined,
        tool_choice: supplementalTools.length > 0 ? "none" : undefined,
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

