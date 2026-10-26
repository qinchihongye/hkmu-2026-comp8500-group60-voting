import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// 本文件位于 frontend/，上溯一级是仓库根目录；backend/frontend/db 共用根目录 .env。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig(({ mode }) => {
  // 只取 Vite 开发代理需要的变量，其余后端/数据库变量不进入前端。
  const env = loadEnv(mode, repoRoot, "");
  const proxyTarget = env.VITE_API_PROXY || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "localhost",
      port: 4173,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
      css: false,
      restoreMocks: true,
      exclude: [
        "tests/e2e/**",
        "**/node_modules/**",
        "**/dist/**",
        "**/.{idea,git,cache,output,temp}/**",
      ],
    },
  };
});