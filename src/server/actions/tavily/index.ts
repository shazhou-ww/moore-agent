import { tavily, type TavilyClientOptions } from "@tavily/core";
import type { ActionWithRun } from "../../../agent-v2/types.ts";
import debug from "debug";

const log = debug("server:actions:tavily");

/**
 * Tavily Actions 配置选项
 */
export type TavilyActionsOptions = {
  /**
   * Tavily API Key（必需）
   */
  apiKey: string;
  /**
   * 默认搜索深度
   */
  defaultSearchDepth?: "basic" | "advanced";
  /**
   * 默认最大搜索结果数量
   */
  defaultMaxResults?: number;
  /**
   * Tavily 客户端其他选项（如代理、API base URL 等）
   */
  clientOptions?: Omit<TavilyClientOptions, "apiKey">;
};

/**
 * 创建基于 Tavily 的 Actions
 * @param options Tavily Actions 配置选项
 * @returns 包含 webSearch 和 webExtract 的 actions 对象
 */
export function createTavilyActions(
  options: TavilyActionsOptions,
): Record<string, ActionWithRun> {
  const { apiKey, defaultSearchDepth = "basic", defaultMaxResults = 5, clientOptions = {} } = options;

  if (!apiKey) {
    throw new Error("Tavily API key is required");
  }

  // 初始化 Tavily 客户端
  const client = tavily({ apiKey, ...clientOptions });

  // WebSearch Action
  const webSearchAction: ActionWithRun = {
    schema: JSON.stringify({
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索查询字符串",
        },
        maxResults: {
          type: "number",
          description: `最大返回结果数量，默认为 ${defaultMaxResults}`,
          default: defaultMaxResults,
        },
        searchDepth: {
          type: "string",
          enum: ["basic", "advanced"],
          description: `搜索深度，basic 或 advanced，默认为 ${defaultSearchDepth}`,
          default: defaultSearchDepth,
        },
      },
      required: ["query"],
    }),
    description: "使用 Tavily 搜索引擎在互联网上搜索信息。输入搜索查询，返回相关的网页结果、摘要和链接。",
    run: async (actionId: string, params: string): Promise<string> => {
      log(`Running webSearch action ${actionId} with params:`, params);

      try {
        // 解析参数
        const parsedParams = JSON.parse(params);
        const { query, maxResults = defaultMaxResults, searchDepth = defaultSearchDepth } = parsedParams;

        if (!query || typeof query !== "string") {
          throw new Error("query parameter is required and must be a string");
        }

        // 执行搜索
        const results = await client.search(query, {
          maxResults,
          searchDepth: searchDepth as "basic" | "advanced",
        });

        // 格式化结果
        const formattedResults = {
          query,
          results: results.results?.map((result: any) => ({
            title: result.title,
            url: result.url,
            content: result.content,
            score: result.score,
          })) || [],
          answer: results.answer || null,
        };

        log(`WebSearch action ${actionId} completed successfully`);
        return JSON.stringify(formattedResults, null, 2);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log(`WebSearch action ${actionId} failed:`, errorMessage);
        throw new Error(`WebSearch failed: ${errorMessage}`);
      }
    },
  };

  // WebExtract Action
  const webExtractAction: ActionWithRun = {
    schema: JSON.stringify({
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "要提取内容的网页 URL",
        },
      },
      required: ["url"],
    }),
    description: "使用 Tavily 从指定的网页 URL 中提取和解析内容。返回网页的主要文本内容、标题和其他相关信息。",
    run: async (actionId: string, params: string): Promise<string> => {
      log(`Running webExtract action ${actionId} with params:`, params);

      try {
        // 解析参数
        const parsedParams = JSON.parse(params);
        const { url } = parsedParams;

        if (!url || typeof url !== "string") {
          throw new Error("url parameter is required and must be a string");
        }

        // 验证 URL 格式
        try {
          new URL(url);
        } catch {
          throw new Error(`Invalid URL format: ${url}`);
        }

        // 提取网页内容（extract 方法接受 urls 数组）
        const response = await client.extract([url]);

        // 格式化结果（extract 返回包含 results 数组的响应）
        const extractedResult = response.results?.[0];
        const formattedResult = {
          url,
          rawContent: extractedResult?.rawContent || null,
          images: extractedResult?.images || null,
          favicon: extractedResult?.favicon || null,
        };

        log(`WebExtract action ${actionId} completed successfully`);
        return JSON.stringify(formattedResult, null, 2);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log(`WebExtract action ${actionId} failed:`, errorMessage);
        throw new Error(`WebExtract failed: ${errorMessage}`);
      }
    },
  };

  return {
    webSearch: webSearchAction,
    webExtract: webExtractAction,
  };
}

