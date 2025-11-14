import { join } from "path";
import { existsSync } from "fs";

const rootDir = process.cwd();
const frontendDir = join(rootDir, "frontend");
const rootNodeModules = join(rootDir, "node_modules");
const frontendNodeModules = join(frontendDir, "node_modules");

// 检查并安装根目录依赖
const installRootDeps = async () => {
  // 检查关键依赖是否存在
  const expressPath = join(rootNodeModules, "express");
  if (!existsSync(rootNodeModules) || !existsSync(expressPath)) {
    console.log("Installing root dependencies...");
    const install = Bun.spawn({
      cmd: ["bun", "install"],
      cwd: rootDir,
      stdio: ["inherit", "inherit", "inherit"],
    });
    await install.exited;
    if (install.exitCode !== 0) {
      console.error("Failed to install root dependencies");
      process.exit(1);
    }
    console.log("Root dependencies installed");
  }
};

// 检查并安装前端依赖
const installFrontendDeps = async () => {
  // 检查关键依赖是否存在（检查 vite 包和 bin 文件）
  const vitePath = join(frontendNodeModules, "vite");
  const viteBinPath = join(frontendNodeModules, ".bin", "vite");
  if (!existsSync(frontendNodeModules) || !existsSync(vitePath) || !existsSync(viteBinPath)) {
    console.log("Installing frontend dependencies...");
    const install = Bun.spawn({
      cmd: ["bun", "install"],
      cwd: frontendDir,
      stdio: ["inherit", "inherit", "inherit"],
    });
    await install.exited;
    if (install.exitCode !== 0) {
      console.error("Failed to install frontend dependencies");
      process.exit(1);
    }
    console.log("Frontend dependencies installed");
  }
};

// 启动后端服务器（watch 模式）
const startServer = () => {
  return Bun.spawn({
    cmd: ["bun", "run", "--watch", "server.ts"],
    cwd: process.cwd(),
    stdio: ["inherit", "inherit", "inherit"],
  });
};

// 启动前端开发服务器
const startFrontend = () => {
  // 使用 bun run dev，这样会使用 package.json 中的脚本，自动找到正确的 vite
  return Bun.spawn({
    cmd: ["bun", "run", "dev"],
    cwd: frontendDir,
    stdio: ["inherit", "inherit", "inherit"],
    env: {
      ...process.env,
      // 确保 PATH 包含 node_modules/.bin
      PATH: `${join(frontendNodeModules, ".bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH || ""}`,
    },
  });
};

// 主函数
const main = async () => {
  // 先安装根目录依赖（如果需要）
  await installRootDeps();
  
  // 再安装前端依赖（如果需要）
  await installFrontendDeps();

  // 启动后端服务器
  const server = startServer();

  // 稍等一下再启动前端，确保后端先启动
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 启动前端开发服务器
  const frontend = startFrontend();

  // 处理退出信号
  process.on("SIGINT", () => {
    server.kill();
    frontend.kill();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    server.kill();
    frontend.kill();
    process.exit(0);
  });
};

main().catch((error) => {
  console.error("Error starting dev server:", error);
  process.exit(1);
});

