import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { it } from "node:test";

it(
  "starts the Node server and shuts it down on SIGTERM",
  { timeout: 10000 },
  async (context) => {
    const child = spawn(process.execPath, ["dist/server/start.js"], {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://user:password@127.0.0.1:1/shadow",
        HOST: "127.0.0.1",
        PORT: "0",
        BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
        BETTER_AUTH_URL: "http://127.0.0.1:3000",
        SHADOW_OWNER_EMAIL: "owner@example.test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    context.after(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const address = await new Promise((resolve, reject) => {
      let stdout = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        const match = stdout.match(/Shadow API listening at (http:\/\/[^\s]+)/);
        if (match) {
          resolve(match[1]);
        }
      });
      child.once("error", reject);
      child.once("exit", () => {
        reject(new Error(`Server exited before listening: ${stderr}`));
      });
    });

    for (const operation of ["start", "pause", "stop"]) {
      const response = await fetch(
        `${address}/api/encounters/enc-1/${operation}`,
        {
          method: "POST",
        },
      );
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
    }

    child.kill("SIGTERM");
    const [code, signal] = await exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.equal(stderr, "");
  },
);
