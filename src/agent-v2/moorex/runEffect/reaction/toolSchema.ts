import { z } from "zod";
import { reactionDecisionSchema } from "../../agentSignal.ts";

/**
 * 迭代决策 Schema（用于 reaction 循环中的决策）
 */
export const iterationDecisionSchema = z.discriminatedUnion("type", [
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

export type IterationDecision = z.infer<typeof iterationDecisionSchema>;

/**
 * 根据是否有更多 history 动态生成迭代决策 Schema
 */
export const createIterationDecisionSchema = (
  hasMoreHistory: boolean,
) => {
  const decisionMadeOption = z.object({
    type: z.literal("decision-made"),
    decision: reactionDecisionSchema,
  });

  const actionDetailOption = z.object({
    type: z.literal("action-detail"),
    ids: z.array(z.string()),
  });

  if (hasMoreHistory) {
    const moreHistoryOption = z.object({
      type: z.literal("more-history"),
    });
    return z.discriminatedUnion("type", [
      decisionMadeOption,
      moreHistoryOption,
      actionDetailOption,
    ]);
  } else {
    return z.discriminatedUnion("type", [
      decisionMadeOption,
      actionDetailOption,
    ]);
  }
};

