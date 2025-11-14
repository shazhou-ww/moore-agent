import { mkdir, writeFile, appendFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import debug from "debug";

type LogLevel = "debug" | "info" | "warn" | "error";

class FileLogger {
  private logDir: string;
  private currentLogFile: string | null = null;
  private currentHour: number = -1;
  private rotateTimer: NodeJS.Timeout | null = null;

  constructor(logDir: string = "logs") {
    this.logDir = logDir;
  }

  /**
   * 初始化日志系统
   */
  async initialize(): Promise<void> {
    // 确保 logs 目录存在
    if (!existsSync(this.logDir)) {
      await mkdir(this.logDir, { recursive: true });
    }

    // 创建初始日志文件
    await this.createNewLogFile();

    // 设置定时器，在整点时分拆文件
    this.scheduleNextRotate();
  }

  /**
   * 创建新的日志文件
   */
  private async createNewLogFile(): Promise<void> {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, -5); // YYYY-MM-DDTHH-MM-SS
    const filename = `server-${timestamp}.log`;
    this.currentLogFile = join(this.logDir, filename);
    this.currentHour = now.getHours();

    // 创建文件并写入启动信息
    const startMessage = `[${now.toISOString()}] Server started. Log file: ${filename}\n`;
    await writeFile(this.currentLogFile, startMessage, "utf-8");

    console.log(`Log file created: ${this.currentLogFile}`);
  }

  /**
   * 写入日志到文件
   */
  async writeLog(level: LogLevel, message: string): Promise<void> {
    if (!this.currentLogFile) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

    try {
      await appendFile(this.currentLogFile, logLine, "utf-8");
    } catch (error) {
      console.error("Failed to write log:", error);
    }
  }

  /**
   * 拆分日志文件（在整点时）
   */
  private async rotateLogFile(): Promise<void> {
    const now = new Date();
    const currentHour = now.getHours();

    // 如果小时数变化了，创建新文件
    if (currentHour !== this.currentHour) {
      const rotateMessage = `[${now.toISOString()}] Rotating log file (hour changed)\n`;
      if (this.currentLogFile) {
        await appendFile(this.currentLogFile, rotateMessage, "utf-8");
      }
      await this.createNewLogFile();
    }

    // 重新调度下一次检查
    this.scheduleNextRotate();
  }

  /**
   * 调度下一次文件拆分检查
   */
  private scheduleNextRotate(): void {
    // 清除旧的定时器
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
    }

    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0); // 下一个整点

    const msUntilNextHour = nextHour.getTime() - now.getTime();

    this.rotateTimer = setTimeout(() => {
      this.rotateLogFile();
    }, msUntilNextHour);
  }

  /**
   * 关闭日志系统
   */
  close(): void {
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
    }
  }
}

// 创建全局日志实例
const fileLogger = new FileLogger();

/**
 * 去除 ANSI 颜色代码
 */
const stripAnsiCodes = (text: string): string => {
  // ANSI 转义序列的正则表达式
  // 匹配 \x1b[ 或 \u001b[ 开头的转义序列
  // 格式：ESC[数字;数字...m
  return text
    .replace(/\u001b\[[0-9;]*m/g, "") // \u001b[ 格式
    .replace(/\x1b\[[0-9;]*m/g, "");  // \x1b[ 格式
};

/**
 * 拦截 debug 包的输出，同时写入文件和控制台
 */
export const setupFileLogging = async (): Promise<void> => {
  await fileLogger.initialize();

  // 启用所有相关的 debug 命名空间（如果未设置 DEBUG 环境变量）
  if (!process.env.DEBUG) {
    process.env.DEBUG = "server*,agent*";
  } else {
    // 如果已设置，确保包含 server 和 agent 命名空间
    const existingDebug = process.env.DEBUG;
    if (!existingDebug.includes("server") && !existingDebug.includes("*")) {
      process.env.DEBUG = `${existingDebug},server*,agent*`;
    }
  }

  // 确保 debug 包使用新的环境变量设置
  // debug.enable() 会重新读取环境变量
  if (typeof debug.enable === "function") {
    debug.enable(process.env.DEBUG);
  }

  // 保存原始的 debug.log 函数
  const originalLog = debug.log;

  // 重写 debug.log 函数
  debug.log = (...args: unknown[]) => {
    // 调用原始函数输出到控制台
    originalLog(...args);

    // debug 包的输出格式通常是：namespace message
    // 我们需要提取消息部分
    let message = "";
    let namespace = "";

    if (args.length > 0) {
      const firstArg = String(args[0]);
      // debug 包的格式通常是 "namespace message" 或只有 "message"
      // 命名空间格式通常是 "namespace:" 或 "namespace message"
      const colonIndex = firstArg.indexOf(":");
      if (colonIndex > 0) {
        // 有命名空间（格式：namespace: message）
        namespace = firstArg.substring(0, colonIndex);
        const remaining = firstArg.substring(colonIndex + 1).trim();
        // 组合所有参数
        const allArgs = [remaining, ...args.slice(1)];
        message = allArgs.map((arg) => {
          if (typeof arg === "string") {
            return stripAnsiCodes(arg);
          }
          if (arg instanceof Error) {
            return `${arg.message}\n${arg.stack}`;
          }
          return JSON.stringify(arg, null, 2);
        }).join(" ");
      } else {
        // 没有命名空间，所有参数都是消息
        message = args.map((arg) => {
          if (typeof arg === "string") {
            return stripAnsiCodes(arg);
          }
          if (arg instanceof Error) {
            return `${arg.message}\n${arg.stack}`;
          }
          return JSON.stringify(arg, null, 2);
        }).join(" ");
      }
    }

    // 根据命名空间和消息内容判断日志级别
    let level: LogLevel = "debug";
    const lowerMessage = message.toLowerCase();
    const lowerNamespace = namespace.toLowerCase();
    
    if (
      lowerNamespace.includes("error") ||
      lowerMessage.includes("error") ||
      lowerMessage.includes("failed") ||
      lowerMessage.includes("exception")
    ) {
      level = "error";
    } else if (
      lowerNamespace.includes("warn") ||
      lowerMessage.includes("warn") ||
      lowerMessage.includes("warning")
    ) {
      level = "warn";
    } else if (
      lowerNamespace.includes("info") ||
      lowerMessage.includes("info")
    ) {
      level = "info";
    }

    // 去除 ANSI 颜色代码后写入文件（异步，不阻塞）
    const cleanMessage = stripAnsiCodes(message);
    fileLogger.writeLog(level, cleanMessage).catch((error) => {
      console.error("Failed to write log to file:", error);
    });
  };
};

/**
 * 关闭文件日志
 */
export const closeFileLogging = (): void => {
  fileLogger.close();
};

