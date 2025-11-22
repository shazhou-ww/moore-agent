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

