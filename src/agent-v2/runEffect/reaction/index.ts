import { partition } from "lodash";
import type { Immutable } from "mutative";
import type { AgentState, HistoryMessage } from "../../agentState.ts";
import type { ReactionEffect } from "../../agentEffects.ts";
import type {
  AgentSignal,
  ReactionCompleteSignal,
  ReactionDecision,
} from "../../agentSignal.ts";
import type { EffectInitializer, RunEffectOptions } from "../types.ts";
import type { Dispatch } from "../effectInitializer.ts";
import { createEffectInitializer } from "../effectInitializer.ts";
import {
  iterationDecisionSchema,
  type IterationDecision,
} from "./toolSchema.ts";
import { toJSONSchema } from "zod";
import { buildSystemPrompt } from "./prompt.ts";

/**
 * Reaction 上下文
 */
type ReactionContext = {
  unrespondedUserMessages: HistoryMessage[];
  unrespondedActionIds: string[];
};

/**
 * 收集尚未响应的消息和 action responses
 */
const collectUnrespondedItems = (
  state: Immutable<AgentState>,
): ReactionContext => {
  const lastReactionTimestamp = state.lastReactionTimestamp;
  
  // 收集尚未响应的用户消息（timestamp > lastReactionTimestamp）
  const unrespondedUserMessages = state.historyMessages
    .filter(({ type, timestamp }) => type === "user" && timestamp > lastReactionTimestamp);

  // 收集尚未响应的 action responses（timestamp > lastReactionTimestamp）
  const unrespondedActionIds = Object.entries(state.actions)
    .filter(
      ([_, action]) =>
        action.response && action.response.timestamp > lastReactionTimestamp,
    )
    .map(([id]) => id);

  return { unrespondedUserMessages, unrespondedActionIds };
};

/**
 * 计算被处理的最后一条 user message 或 action response 的时间戳
 */
const getLastProcessedTimestamp = (
  state: Immutable<AgentState>,
  reactionContext: ReactionContext,
): number => {
  const lastReactionTimestamp = state.lastReactionTimestamp;
  const userMessageTimestamps = reactionContext.unrespondedUserMessages.map(
    (msg) => msg.timestamp,
  );
  const actionResponseTimestamps = reactionContext.unrespondedActionIds
    .map((id) => state.actions[id]?.response?.timestamp)
    .filter((ts): ts is number => ts !== undefined);

  return Math.max(
    lastReactionTimestamp,
    ...userMessageTimestamps,
    ...actionResponseTimestamps,
  );
};

/**
 * 检查是否有新输入，如果没有则返回 noop 决策
 */
const checkAndHandleNoopDecision = (
  state: Immutable<AgentState>,
  reactionContext: ReactionContext,
  dispatch: Dispatch,
): boolean => {
  if (
    reactionContext.unrespondedUserMessages.length === 0 &&
    reactionContext.unrespondedActionIds.length === 0
  ) {
    const timestamp = getLastProcessedTimestamp(state, reactionContext);
    const signal: ReactionCompleteSignal = {
      kind: "reaction-complete",
      decision: { type: "noop" },
      timestamp,
    };
    dispatch(signal as Immutable<AgentSignal>);
    return true;
  }
  return false;
};

/**
 * 构建消息窗口
 * 1. 上次 reaction 之后的所有消息（both user/assistant messages）
 * 2. prepend 上上次 reaction 之前的 currentHistoryCount 条消息
 */
const buildMessageWindow = (
  state: Immutable<AgentState>,
  currentHistoryCount: number,
): HistoryMessage[] => {
  const allMessages = state.historyMessages;
  const lastReactionTimestamp = state.lastReactionTimestamp;

  // Partition: 分割为 lastReactionTimestamp 之前和之后的消息
  const [messagesBefore, messagesAfter] = partition(
    allMessages,
    (msg: HistoryMessage) => msg.timestamp <= lastReactionTimestamp,
  );

  // 从之前的部分截取最后一段
  const prependedMessages = messagesBefore.slice(-currentHistoryCount);

  // 合并：先放历史消息，再放新消息
  return [...prependedMessages, ...messagesAfter];
};

/**
 * 准备系统提示词和消息窗口
 */
const prepareIterationContext = (
  state: Immutable<AgentState>,
  iterationState: IterationState,
): {
  systemPrompt: string;
  messageWindow: HistoryMessage[];
} => {
  // 构建消息窗口
  const messageWindow = buildMessageWindow(
    state,
    iterationState.currentHistoryCount,
  );

  // 构建系统提示词
  const systemPrompt = buildSystemPrompt(state, iterationState);

  return { systemPrompt, messageWindow };
};

const iterationDecisionOutputSchema = toJSONSchema(iterationDecisionSchema);
/**
 * 调用 think 进行一轮决策
 */
const performIterationDecision = async (
  systemPrompt: string,
  messageWindow: HistoryMessage[],
  think: (
    systemPrompts: string,
    messageWindow: HistoryMessage[],
    outputSchema: Record<string, unknown>
  ) => Promise<string>
): Promise<IterationDecision> => {
  // 调用 LLM（think）：思考下一步决策
  const result = await think(
    systemPrompt,
    messageWindow,
    iterationDecisionOutputSchema
  );

  // 解析 LLM 返回的结果
  const parsed = JSON.parse(result);
  return iterationDecisionSchema.parse(parsed);
};

/**
 * 迭代状态
 */
export type IterationState = {
  currentHistoryCount: number; // 当前加载的历史消息条数
  loadedActionDetailIds: Set<string>;
  decision: ReactionDecision | null;
};

/**
 * 处理决策结果，决定是否继续迭代
 */
const handleIterationDecision = (
  decideCall: IterationDecision,
  iterationState: IterationState,
  additionalHistoryCount: number,
): IterationState => {
  if (decideCall.type === "decision-made") {
    return {
      ...iterationState,
      decision: decideCall.decision,
    };
  } else if (decideCall.type === "more-history") {
    // 追溯更多历史消息
    return {
      ...iterationState,
      currentHistoryCount:
        iterationState.currentHistoryCount + additionalHistoryCount,
    };
  } else if (decideCall.type === "action-detail") {
    // 补充 action 详情
    return {
      ...iterationState,
      loadedActionDetailIds: new Set([
        ...iterationState.loadedActionDetailIds,
        ...decideCall.ids,
      ]),
    };
  }

  // 不应该到达这里
  throw new Error(
    `Unknown iteration decision type: ${(decideCall as { type: string }).type}`
  );
};

/**
 * 发送决策结果信号
 */
const dispatchReactionComplete = (
  state: Immutable<AgentState>,
  reactionContext: ReactionContext,
  decision: ReactionDecision,
  dispatch: Dispatch,
): void => {
  const timestamp = getLastProcessedTimestamp(state, reactionContext);
  const signal: ReactionCompleteSignal = {
    kind: "reaction-complete",
    decision,
    timestamp,
  };
  dispatch(signal as Immutable<AgentSignal>);
};

/**
 * 创建 ReactionEffect 的初始器
 */
export const createReactionEffectInitializer = (
  effect: Immutable<ReactionEffect>,
  state: Immutable<AgentState>,
  key: string,
  options: RunEffectOptions
): EffectInitializer =>
  createEffectInitializer(
    async (dispatch: Dispatch, isCancelled: () => boolean) => {
      const {
        behavior: { think },
        options: {
          reaction: { initialHistoryCount, additionalHistoryCount },
        },
      } = options;

      // 收集尚未响应的消息和 action responses
      const reactionContext: ReactionContext = collectUnrespondedItems(state);

      // 如果没有新的输入，直接返回 noop 决策
      if (checkAndHandleNoopDecision(state, reactionContext, dispatch)) {
        return;
      }

      // 初始化迭代状态
      let iterationState: IterationState = {
        currentHistoryCount: initialHistoryCount,
        loadedActionDetailIds: new Set<string>(
          reactionContext.unrespondedActionIds,
        ), // 初始加载未响应的 action 详情
        decision: null,
      };

      // 循环决策，直到做出最终决策
      while (iterationState.decision === null) {
        // 1. 准备系统提示词和消息窗口
        const { systemPrompt, messageWindow } = prepareIterationContext(
          state,
          iterationState,
        );

        // 2. 调用 think，进行一轮决策
        const decideCall = await performIterationDecision(
          systemPrompt,
          messageWindow,
          think
        );

        if (isCancelled()) {
          return;
        }

        // 3. 根据决策结果，更新迭代状态
        iterationState = handleIterationDecision(
          decideCall,
          iterationState,
          additionalHistoryCount,
        );
      }

      // 发送决策结果
      dispatchReactionComplete(
        state,
        reactionContext,
        iterationState.decision,
        dispatch,
      );
    }
  );
