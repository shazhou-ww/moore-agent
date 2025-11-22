import type { Immutable } from "mutative";
import { createMoorex, type Moorex } from "moorex";
import type { AgentState } from "./agentState.ts";
import type { AgentSignal } from "./agentSignal.ts";
import type { AgentEffect } from "./agentEffects.ts";
import { transition } from "./transition/index.ts";
import { effectsAt } from "./effectsAt.ts";
import { createRunEffect, type RunEffectOptions } from "./runEffect/index.ts";

/**
 * 创建 AgentMoorex 实例（柯里化形式）
 * 先接受 RunEffectOptions，再接受初始状态
 */
export const createAgentMoorex = (
  runEffectOptions: RunEffectOptions,
  initialState: Immutable<AgentState>
): Moorex<AgentState, AgentSignal, AgentEffect> =>
  createMoorex<AgentState, AgentSignal, AgentEffect>({
    initiate: () => initialState,
    transition,
    effectsAt,
    runEffect: createRunEffect(runEffectOptions),
  });
