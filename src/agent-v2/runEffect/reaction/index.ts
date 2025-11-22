import { v4 } from "uuid";
import type { Immutable } from "mutative";
import type { AgentState, HistoryMessage } from "../../agentState.ts";
import type { ReactionEffect } from "../../agentEffects.ts";
import type { AgentSignal, ReactionCompleteSignal, ReactionDecision } from "../../agentSignal.ts";
import type { EffectInitializer, RunEffectOptions } from "../types.ts";
import type { Dispatch } from "../effectInitializer.ts";
import { createEffectInitializer } from "../effectInitializer.ts";
import { now } from "../../../utils/time.ts";
import { iterationDecisionSchema, type IterationDecision } from "./toolSchema.ts";
import { toJSONSchema } from "zod";
import { buildSystemPrompt } from "./prompt.ts";
import {
  collectUnrespondedItems,
  calculateMessageRounds,
  getRecentMessageRounds,
  buildActionSummary,
} from "./utils.ts";

/**
 * 解析 LLM 返回的迭代决策结果
 */
const parseDecideFunctionCall = (result: string): IterationDecision => {
  try {
    // 尝试解析为直接的函数调用结果
    const parsed = JSON.parse(result);
    if (parsed.type) {
      // 验证并解析
      return iterationDecisionSchema.parse(parsed);
    } else if (parsed.tool_calls && parsed.tool_calls.length > 0) {
      // 如果是工具调用格式，提取第一个工具调用的参数
      const toolCall = parsed.tool_calls[0];
      if (toolCall.function?.name === "decide") {
        const args = typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
        return iterationDecisionSchema.parse(args);
      }
    }
    throw new Error(`Failed to parse iteration decision: missing type or tool_calls in response: ${result}`);
  } catch (error) {
    // 如果解析失败，直接抛出错误
    if (error instanceof Error) {
      throw new Error(`Failed to parse iteration decision from LLM response: ${error.message}. Response: ${result}`);
    }
    throw new Error(`Failed to parse iteration decision from LLM response: ${String(error)}. Response: ${result}`);
  }
};

/**
 * 创建 ReactionEffect 的初始器
 */
export const createReactionEffectInitializer = (
  effect: Immutable<ReactionEffect>,
  state: Immutable<AgentState>,
  key: string,
  options: RunEffectOptions,
): EffectInitializer => {
  const {
    think,
    getSystemPrompts,
    actions,
    reactionInitialHistoryRounds,
    reactionAdditionalHistoryRounds,
  } = options;

  return createEffectInitializer(
    async (dispatch: Dispatch, isCancelled: () => boolean) => {
      if (isCancelled()) {
        return;
      }

      try {
        const baseSystemPrompts = getSystemPrompts();
        const lastReactionTimestamp = state.lastReactionTimestamp;

        // 收集尚未响应的消息和 action responses
        const { unrespondedUserMessages, unrespondedActionIds } = collectUnrespondedItems(
          state,
          lastReactionTimestamp,
        );

        // 如果没有新的输入，直接返回 noop 决策
        if (unrespondedUserMessages.length === 0 && unrespondedActionIds.length === 0) {
          const signal: ReactionCompleteSignal = {
            kind: "reaction-complete",
            messageId: v4(),
            decision: { type: "noop" },
            timestamp: now(),
          };
          dispatch(signal as Immutable<AgentSignal>);
          return;
        }

        // 初始化状态
        let currentHistoryRounds = reactionInitialHistoryRounds;
        let loadedActionDetailIds = new Set<string>(unrespondedActionIds); // 初始加载未响应的 action 详情
        let decision: ReactionDecision | null = null;

        // 循环决策，直到做出最终决策
        while (true) {
          if (isCancelled()) {
            return;
          }

          // 计算总的消息轮次
          const totalRounds = calculateMessageRounds(state.historyMessages);

          // 获取最近 n 轮的消息
          const recentMessages = getRecentMessageRounds(
            state.historyMessages,
            currentHistoryRounds,
          );

          // 合并未响应的消息和最近的历史消息
          const messageWindow: HistoryMessage[] = [];
          
          // 先添加历史消息（排除未响应的消息，避免重复）
          const unrespondedMessageIds = new Set(unrespondedUserMessages.map((m) => m.id));
          for (const msg of recentMessages) {
            if (!unrespondedMessageIds.has(msg.id)) {
              messageWindow.push({ ...msg });
            }
          }
          
          // 然后添加未响应的消息
          for (const msg of unrespondedUserMessages) {
            messageWindow.push({ ...msg });
          }

          // 构建 action 摘要
          const actionSummaries = buildActionSummary(state, loadedActionDetailIds);

          // 构建系统提示词
          const systemPrompt = buildSystemPrompt(
            baseSystemPrompts,
            actions,
            actionSummaries,
            currentHistoryRounds,
            totalRounds,
          );

          // 调用 LLM（think）：思考下一步决策
          const decideOutputSchema = toJSONSchema(iterationDecisionSchema);
          const result = await think(
            systemPrompt,
            messageWindow,
            decideOutputSchema,
          );

          if (isCancelled()) {
            return;
          }

          // 解析 LLM 返回的结果
          const decideCall = parseDecideFunctionCall(result);

          // 处理决策
          if (decideCall.type === "decision-made") {
            decision = decideCall.decision;
            break;
          } else if (decideCall.type === "more-history") {
            // 追溯更多历史消息
            currentHistoryRounds += reactionAdditionalHistoryRounds;
            // 继续循环
          } else if (decideCall.type === "action-detail") {
            // 补充 action 详情
            for (const id of decideCall.ids) {
              loadedActionDetailIds.add(id);
            }
            // 继续循环
          }
        }

        if (!decision) {
          throw new Error("Decision loop ended without a decision");
        }

        if (isCancelled()) {
          return;
        }

        // 发送决策结果
        const signal: ReactionCompleteSignal = {
          kind: "reaction-complete",
          messageId: v4(),
          decision,
          timestamp: now(),
        };

        dispatch(signal as Immutable<AgentSignal>);
      } catch (error) {
        if (!isCancelled()) {
          console.error("ReactionEffect failed:", error);
          throw error;
        }
      }
    },
  );
};

