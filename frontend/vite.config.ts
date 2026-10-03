import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** How long an API request waits for a backend that is starting or restarting. */
const BACKEND_WAIT_MS = 10_000;

/** Resolve when the backend answers its health route, or when the wait is over. */
async function waitForBackend(origin: string): Promise<void> {
  const deadline = Date.now() + BACKEND_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(`${origin}/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * `pnpm run dev` restarts the backend after each change to its code. A page
 * that reloads at the same moment would get a proxy error. This holds each API
 * request until the backend answers again.
 */
function holdApiRequestsUntilBackendAnswers(origin: string): Plugin {
  return {
    name: "hold-api-requests-until-backend-answers",
    configureServer(server) {
      server.middlewares.use("/api", (_request, _response, next) => {
        void waitForBackend(origin).then(() => next());
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // The backend takes HOST and PORT from the process environment, then from
  // the root `.env`. Read them the same way, so the proxy follows the backend.
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), [
    "HOST",
    "PORT",
  ]);
  const backendOrigin = `http://${env.HOST || "127.0.0.1"}:${env.PORT || "3000"}`;

  return {
    plugins: [react(), holdApiRequestsUntilBackendAnswers(backendOrigin)],
    server: {
      proxy: {
        "/api": { target: backendOrigin, changeOrigin: true },
      },
    },
    test: {
      // Logic tests need no browser. The one rendered test opts into jsdom.
      environment: "node",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      // Enabled by the `test` script. See docs/agents/testing.md (Coverage).
      coverage: {
        provider: "v8",
        reporter: ["text"],
        // The same tests measure the backend. Source maps point its build output
        // back to its source files.
        allowExternal: true,
        include: [
          "src/features/**/*.ts",
          "**/backend/dist/features/**",
          "**/backend/src/features/**",
        ],
        exclude: [
          "**/*.test.*",
          "**/features/core/tests/**",
          "**/features/core/live/**",
        ],
        thresholds: {
          "src/features/*/ui/*-{logic,plugin}.ts": {
            functions: 100,
            perFile: true,
          },
        },
      },
    },
  };
});
