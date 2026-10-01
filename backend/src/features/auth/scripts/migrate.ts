import { createApp } from "../../core/live/index.js";

try {
  const app = createApp();
  try {
    await app.services.auth.migrate();
    console.log("Authentication schema is ready");
  } finally {
    await app.close();
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Auth migration failed",
  );
  process.exitCode = 1;
}
