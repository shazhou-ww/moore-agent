import express, { type Request, type Response } from "express";
import { createAgent, type Agent } from "../agent/index.ts";
import type { LLMCallFn, ToolCallFn } from "../types/effects.ts";
import { createLLMCallFn } from "./llm.ts";
import { createToolCallFn } from "./tools.ts";
import debug from "debug";

const log = debug("server");

let agent: Agent | null = null;

const initializeAgent = async () => {
  if (agent) {
    return agent;
  }

  const systemPrompt = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";
  
  const callLLM: LLMCallFn = createLLMCallFn({
    endpoint: process.env.LLM_ENDPOINT || "",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || "",
  });

  const callTool: ToolCallFn = createToolCallFn();

  agent = await createAgent({
    systemPrompt,
    callLLM,
    callTool,
  });

  log("Agent initialized");
  return agent;
};

export const startServer = async (port: number = 3000) => {
  await initializeAgent();

  const app = express();

  // Middleware
  app.use(express.json());
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    
    next();
  });

  // POST /api/send
  app.post("/api/send", async (req: Request, res: Response) => {
    try {
      const { userMessage } = req.body;

      if (!userMessage || typeof userMessage !== "object") {
        return res.status(400).json({ error: "UserMessage is required" });
      }

      // 验证 userMessage 结构
      if (
        !userMessage.id ||
        typeof userMessage.id !== "string" ||
        !userMessage.content ||
        typeof userMessage.content !== "string" ||
        !userMessage.timestamp ||
        typeof userMessage.timestamp !== "number" ||
        userMessage.kind !== "user"
      ) {
        return res.status(400).json({ error: "Invalid UserMessage format" });
      }

      const currentAgent = await initializeAgent();
      
      // 检查 ID 冲突
      const state = currentAgent.getState();
      const hasConflict = state.messages.some((msg) => msg.id === userMessage.id);
      
      if (hasConflict) {
        return res.status(409).json({ error: "Message ID conflict" });
      }

      currentAgent.sendMessage(userMessage);

      return res.json({ success: true });
    } catch (error) {
      log("Error in /api/send:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/receive (SSE)
  app.get("/api/receive", async (req: Request, res: Response) => {
    const currentAgent = await initializeAgent();
    const state = currentAgent.getState();

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // 禁用 nginx 缓冲

    // 发送初始 state-updated 事件
    const initialEvent = {
      type: "state-updated",
      state,
      effectCount: 0,
    };
    res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);

    // 订阅后续事件
    const unsubscribe = currentAgent.on((event) => {
      try {
        // 只发送非 state-updated 的事件
        if (event.type !== "state-updated") {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (error) {
        log("Error sending SSE event:", error);
      }
    });

    // 定期发送心跳以保持连接
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch (error) {
        clearInterval(heartbeatInterval);
        unsubscribe();
        res.end();
      }
    }, 30000); // 每 30 秒发送一次心跳

    // 处理客户端断开连接
    req.on("close", () => {
      log("Client disconnected from SSE");
      clearInterval(heartbeatInterval);
      unsubscribe();
      res.end();
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).send("Not Found");
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
    log("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  const server = app.listen(port, () => {
    log(`Server running on http://localhost:${port}`);
  });

  return server;
};

