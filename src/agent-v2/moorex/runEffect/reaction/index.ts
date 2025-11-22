import { partition } from "lodash";
import type { Immutable } from "mutative";
import type { AgentState, HistoryMessage, Action } from "../../agentState.ts";
import type { ReactionEffect } from "../../agentEffects.ts";
import type {
  AgentSignal,
  ReactionCompleteSignal,
  ReactionDecision,
  ReactionDecisionExt,
} from "../../agentSignal.ts";
import type { EffectInitializer, RunEffectOptions, ThinkFn } from "../types.ts";
import type { Dispatch } from "../effectInitializer.ts";
import { createEffectInitializer } from "../effectInitializer.ts";
import {
  iterationDecisionSchema,
  createIterationDecisionSchema,
  type IterationDecision,
} from "./toolSchema.ts";
import { toJSONSchema } from "zod";
import { buildSystemPrompt } from "./prompt.ts";
import { v4 as randomUUID } from "uuid";

/**
 * Reaction 上下文
 */
type ReactionContext = {
  unrespondedUserMessages: HistoryMessage[];
  unrespondedActions: Record<string, Action>;
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
  const unrespondedActions = Object.entries(state.actions)
    .filter(
      ([_, action]) =>
        action.response && action.response.timestamp > lastReactionTimestamp,
    )
    .reduce<Record<string, Action>>((acc, [id, action]) => {
      acc[id] = action;
      return acc;
    }, {});

  return { unrespondedUserMessages, unrespondedActions };
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
  const actionResponseTimestamps = Object.values(reactionContext.unrespondedActions)
    .map((action) => action.response?.timestamp)
    .filter((ts): ts is number => ts !== undefined);

  return Math.max(
    lastReactionTimestamp,
    ...userMessageTimestamps,
    ...actionResponseTimestamps,
  );
};

/**
 * 检查是否有新的更新
 */
const hasNothingToUpdate = (reactionContext: ReactionContext): boolean => {
  return (
    reactionContext.unrespondedUserMessages.length === 0 &&
    Object.keys(reactionContext.unrespondedActions).length === 0
  );
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
  getSystemPrompts: (funcName: string) => string;
  messageWindow: HistoryMessage[];
} => {
  // 构建消息窗口
  const messageWindow = buildMessageWindow(
    state,
    iterationState.currentHistoryCount,
  );

  // 构建系统提示词函数（柯里化后）
  const getSystemPrompts = buildSystemPrompt(state, iterationState);

  return { getSystemPrompts, messageWindow };
};

/**
 * 调用 think 进行一轮决策
 */
const performIterationDecision = async (
  getSystemPrompts: (funcName: string) => string,
  messageWindow: HistoryMessage[],
  think: ThinkFn,
  hasMoreHistory: boolean,
): Promise<IterationDecision> => {
  // 根据是否有更多 history 动态生成 schema
  const dynamicSchema = createIterationDecisionSchema(hasMoreHistory);
  const iterationDecisionOutputSchema = toJSONSchema(dynamicSchema);

  // 调用 LLM（think）：思考下一步决策
  const result = await think(
    getSystemPrompts,
    messageWindow,
    iterationDecisionOutputSchema
  );

  // 解析 LLM 返回的结果
  const parsed = JSON.parse(result);
  return dynamicSchema.parse(parsed);
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
  totalMessages: number,
): IterationState => {
  if (decideCall.type === "decision-made") {
    return {
      ...iterationState,
      decision: decideCall.decision,
    };
  } else if (decideCall.type === "more-history") {
    // 检查是否还有更多 history
    if (iterationState.currentHistoryCount >= totalMessages) {
      // 已经没有更多 history 了，返回 noop 决策
      return {
        ...iterationState,
        decision: { type: "noop" },
      };
    }
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
 * 将 ReactionDecision 转换为 ReactionDecisionExt，注入生成的 id
 */
const injectDecisionIds = (decision: ReactionDecision): ReactionDecisionExt => {
  if (decision.type === "reply-to-user") {
    // 为 reply-to-user 生成 messageId
    return {
      ...decision,
      messageId: randomUUID(),
    };
  } else if (decision.type === "adjust-actions") {
    // 为 adjust-actions 的每个 newAction 生成 actionId
    return {
      ...decision,
      newActions: decision.newActions.map((action) => ({
        ...action,
        actionId: randomUUID(),
      })),
    };
  } else {
    // noop 不需要注入 id
    return decision;
  }
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
  // 注入生成的 id
  const decisionExt = injectDecisionIds(decision);
  const signal: ReactionCompleteSignal = {
    kind: "reaction-complete",
    decision: decisionExt,
    timestamp,
  };
  dispatch(signal as Immutable<AgentSignal>);
};

/**
 * 发送 noop 决策信号
 */
const dispatchNoop = (
  state: Immutable<AgentState>,
  reactionContext: ReactionContext,
  dispatch: Dispatch,
): void => {
  dispatchReactionComplete(state, reactionContext, { type: "noop" }, dispatch);
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
      if (hasNothingToUpdate(reactionContext)) {
        dispatchNoop(state, reactionContext, dispatch);
        return;
      }

      // 初始化迭代状态
      let iterationState: IterationState = {
        currentHistoryCount: initialHistoryCount,
        loadedActionDetailIds: new Set<string>(
          Object.keys(reactionContext.unrespondedActions),
        ), // 初始加载未响应的 action 详情
        decision: null,
      };

      // 循环决策，直到做出最终决策
      const totalMessages = state.historyMessages.length;
      while (iterationState.decision === null) {
        // 1. 准备系统提示词和消息窗口
        const { getSystemPrompts: getSystemPrompt, messageWindow } = prepareIterationContext(
          state,
          iterationState,
        );

        // 检查是否还有更多 history
        const hasMoreHistory = iterationState.currentHistoryCount < totalMessages;

        // 2. 调用 think，进行一轮决策
        const decideCall = await performIterationDecision(
          getSystemPrompt,
          messageWindow,
          think,
          hasMoreHistory,
        );

        if (isCancelled()) {
          return;
        }

        // 3. 根据决策结果，更新迭代状态
        iterationState = handleIterationDecision(
          decideCall,
          iterationState,
          additionalHistoryCount,
          totalMessages,
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
