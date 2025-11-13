import { createMoorex, type MoorexDefinition } from "moorex";
import type { AgentState, Signal } from "../types/schema.ts";
import type { Effect } from "../types/effects.ts";
import type { AgentDefinitionDeps } from "./definition.ts";
import { createAgentDefinition } from "./definition.ts";
import { runEffect } from "../runtime/effects.ts";
import type { LLMCallFn } from "../runtime/llm.ts";
import type { ToolCallFn } from "../runtime/tools.ts";

export type AgentMachineDeps = AgentDefinitionDeps & {
  callLLM: LLMCallFn;
  callTool: ToolCallFn;
};

/**
 * 创建 Agent 状态机
 */
export const createAgentMachine = (deps: AgentMachineDeps) => {
  const definition = createAgentDefinition(deps);
  
  const moorexDefinition: MoorexDefinition<AgentState, Signal, Effect> = {
    initialState: definition.initialState,
    transition: definition.transition,
    effectsAt: definition.effectsAt,
    runEffect: (effect: Effect) => runEffect(effect, {
      callLLM: deps.callLLM,
      callTool: deps.callTool,
    }),
  };
  
  return createMoorex(moorexDefinition);
};

