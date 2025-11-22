import { z } from "zod";
import { reactionDecisionSchema } from "../../agentSignal.ts";
import type { LLMTool } from "../types.ts";

/**
 * Decide 函数调用的参数类型
 */
export const decideFunctionCallSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("decision-made"),
    decision: reactionDecisionSchema,
  }),
  z.object({
    type: z.literal("more-history"),
  }),
  z.object({
    type: z.literal("action-detail"),
    ids: z.array(z.string()),
  }),
]);

export type DecideFunctionCall = z.infer<typeof decideFunctionCallSchema>;

/**
 * 创建 decide 工具函数定义
 */
export const createDecideTool = (): LLMTool => {
  // 手动构建 JSON Schema，因为 zod 的 schema 比较复杂
  return {
    type: "function",
    function: {
      name: "decide",
      description: "决定下一步的计划。可以做出最终决策，或者请求更多历史消息或 action 详情。",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["decision-made", "more-history", "action-detail"],
            description: "决策类型",
          },
          decision: {
            type: "object",
            description: "当 type 为 'decision-made' 时，提供决策结果",
            oneOf: [
              {
                type: "object",
                properties: {
                  type: { type: "string", const: "noop" },
                },
                required: ["type"],
              },
              {
                type: "object",
                properties: {
                  type: { type: "string", const: "reply-to-user" },
                  lastHistoryMessageId: { type: "string" },
                  relatedActionIds: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["type", "lastHistoryMessageId", "relatedActionIds"],
              },
              {
                type: "object",
                properties: {
                  type: { type: "string", const: "adjust-actions" },
                  cancelActions: {
                    type: "array",
                    items: { type: "string" },
                  },
                  newActions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        actionRequestId: { type: "string" },
                        actionName: { type: "string" },
                        initialIntent: { type: "string" },
                      },
                      required: ["actionRequestId", "actionName", "initialIntent"],
                    },
                  },
                },
                required: ["type", "cancelActions", "newActions"],
              },
            ],
          },
          ids: {
            type: "array",
            items: { type: "string" },
            description: "当 type 为 'action-detail' 时，提供需要详情的 action request ids",
          },
        },
        required: ["type"],
      },
    },
  };
};

