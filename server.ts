import { startServer } from "./src/server/index.ts";
import { setupFileLogging, closeFileLogging } from "./src/utils/logger.ts";
import "dotenv/config";

const port = parseInt(process.env.PORT || "3000", 10);

// 初始化文件日志
setupFileLogging()
  .then(() => {
    return startServer(port);
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  closeFileLogging();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  closeFileLogging();
  process.exit(0);
});

