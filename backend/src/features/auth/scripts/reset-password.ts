import { createApp } from "../../core/live/index.js";
import { withTerminalPrompt } from "./terminal-prompt.js";

try {
  const app = createApp();
  try {
    await app.logic.authPasswordReset.initialize();
    const password = await withTerminalPrompt(({ askNewPassword }) =>
      askNewPassword(),
    );
    const user = await app.logic.authPasswordReset.resetPassword({
      email: process.argv[2],
      password,
    });
    console.log(
      `The password of ${user.email} is changed, and each session of the account is ended.`,
    );
  } finally {
    await app.close();
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "The password reset failed",
  );
  process.exitCode = 1;
}
