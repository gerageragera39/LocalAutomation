import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const cacheVersion = Date.now().toString();

const replaceServiceWorkerCacheVersion = () => {
  return {
    name: "replace-service-worker-cache-version",
    apply: "build",
    async closeBundle() {
      const swPath = path.resolve(process.cwd(), "dist", "sw.js");
      const source = await readFile(swPath, "utf-8");
      const next = source.replaceAll("__CACHE_VERSION__", cacheVersion);
      await writeFile(swPath, next, "utf-8");
    },
  } as const;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = env.PORT ?? 3000;

  return {
    plugins: [react(), replaceServiceWorkerCacheVersion()],
    define: {
      __CACHE_VERSION__: JSON.stringify(cacheVersion),
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": {
          target: `http://localhost:${port}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
