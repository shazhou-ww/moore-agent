import { get } from "lodash";
import type { ActFn } from "../moorex/runEffect/types.ts";
import type { ActionWithRun } from "../types.ts";

/**
 * 创建 ActFn（调用 Action 的 run 函数）
 */
export const createActFn = (
  actions: Record<string, ActionWithRun>,
): ActFn => {
  return async (actionName: string, parameters: string): Promise<string> => {
    const action = get(actions, actionName);
    if (!action) {
      throw new Error(`Action not found: ${actionName}`);
    }

    try {
      return await action.run(parameters);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Action ${actionName} failed: ${errorMessage}`);
    }
  };
};

