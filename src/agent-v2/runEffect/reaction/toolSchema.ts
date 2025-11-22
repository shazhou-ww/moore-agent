import { z, toJSONSchema } from "zod";
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
  // 使用 zod 4 的 toJSONSchema() 方法直接从 schema 生成 JSON Schema
  const jsonSchema = toJSONSchema(decideFunctionCallSchema);
  
  return {
    type: "function",
    function: {
      name: "decide",
      description: "决定下一步的计划。可以做出最终决策，或者请求更多历史消息或 action 详情。",
      parameters: jsonSchema,
    },
  };
};

