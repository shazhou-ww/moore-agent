import express, { type Request, type Response } from "express";
import { createAgent, type Agent, type CreateAgentOptions } from "../agent-v2/index.ts";
import debug from "debug";
import { createTavilyActions } from "./actions/tavily/index.ts";

const log = debug("server");

let agent: Agent | null = null;

// 固定使用全 0 的 UUID 作为 agent key
const AGENT_KEY = "00000000-0000-0000-0000-000000000000";

const initializeAgent = async () => {
  if (agent) {
    return agent;
  }

  const systemPrompts = process.env.SYSTEM_PROMPT || "You are a helpful assistant.";

  // 配置 LLM 模型
  const llmEndpoint = process.env.LLM_ENDPOINT || "";
  const llmApiKey = process.env.LLM_API_KEY || "";
  const llmModel = process.env.LLM_MODEL || "";
  const llmTemperature = parseFloat(process.env.LLM_TEMPERATURE || "0.7");
  const llmTopP = parseFloat(process.env.LLM_TOP_P || "1.0");

  if (!llmEndpoint || !llmApiKey || !llmModel) {
    throw new Error("LLM configuration is incomplete. Please set LLM_ENDPOINT, LLM_API_KEY, and LLM_MODEL environment variables.");
  }

  // 创建 Tavily Actions
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  const tavilyActions = tavilyApiKey
    ? createTavilyActions({
        apiKey: tavilyApiKey,
        defaultSearchDepth: (process.env.TAVILY_DEFAULT_SEARCH_DEPTH as "basic" | "advanced") || "basic",
        defaultMaxResults: parseInt(process.env.TAVILY_DEFAULT_MAX_RESULTS || "5", 10),
      })
    : {};

  // 创建 CreateAgentOptions
  const options: CreateAgentOptions = {
    systemPrompts,
    actions: tavilyActions,
    thinkModel: {
      provider: {
        endpoint: llmEndpoint,
        apiKey: llmApiKey,
      },
      model: llmModel,
      temperature: llmTemperature,
      topP: llmTopP,
    },
    speakModel: {
      provider: {
        endpoint: llmEndpoint,
        apiKey: llmApiKey,
      },
      model: llmModel,
      temperature: llmTemperature,
      topP: llmTopP,
    },
    persistence: {
      adapter: {
        location: process.env.PERSISTENCE_LOCATION,
        createIfMissing: process.env.PERSISTENCE_CREATE_IF_MISSING !== "false",
        compression: process.env.PERSISTENCE_COMPRESSION !== "false",
      },
      debounceDelay: parseInt(process.env.PERSISTENCE_DEBOUNCE_DELAY || "2000", 10),
    },
  };

  agent = await createAgent(AGENT_KEY, options);

  log("Agent initialized with key:", AGENT_KEY);
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
      const { content } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required and must be a string" });
      }

      const currentAgent = await initializeAgent();
      
      // agent-v2 的 sendMessage 只接受 content: string
      currentAgent.sendMessage(content);

      return res.json({ success: true });
    } catch (error) {
      log("Error in /api/send:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/receive (SSE)
  app.get("/api/receive", async (req: Request, res: Response) => {
    log("SSE connection requested");
    const currentAgent = await initializeAgent();
    const state = currentAgent.getState();

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // 禁用 nginx 缓冲

    // 发送初始 state-updated 事件
    try {
      const initialEvent = {
        type: "state-updated",
        state,
      };
      const eventData = `data: ${JSON.stringify(initialEvent)}\n\n`;
      log("Sending initial state-updated event");
      log("State keys:", Object.keys(state));
      res.write(eventData);
      // 确保数据被立即发送（Express 会自动处理，但我们可以显式调用）
      if (typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    } catch (error) {
      log("Error sending initial state:", error);
      res.status(500).end();
      return;
    }

    // 订阅后续事件
    const unsubscribe = currentAgent.on((event) => {
      try {
        // agent-v2 的事件结构可能不同，直接发送所有事件
        res.write(`data: ${JSON.stringify(event)}\n\n`);
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
    console.log(`Server running on http://localhost:${port}`);
  });

  return server;
};

