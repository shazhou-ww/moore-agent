import type { ToolCallFn } from "../types/effects.ts";
import debug from "debug";

const log = debug("server:tools");

/**
 * 创建工具调用函数（暂时留空）
 */
export const createToolCallFn = (): ToolCallFn => {
  return async (name: string, input: string): Promise<string> => {
    log("Tool call requested:", name, "with input:", input);
    
    // 暂时返回空实现
    return JSON.stringify({
      error: "Tool calls are not yet implemented",
      tool: name,
      input,
    });
  };
};

