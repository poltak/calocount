import { migrations } from "../../core/database/migrations.js";
import { createApp } from "../../core/live/index.js";
import { withTerminalPrompt } from "./terminal-prompt.js";

try {
  const app = createApp();
  try {
    await app.logic.migration.migrate({ migrations });
    await app.logic.ownerSetup.initialize();
    const credentials = await withTerminalPrompt(
      async ({ ask, askNewPassword }) => ({
        name: (await ask("Owner name [Owner]: ")).trim() || "Owner",
        password: await askNewPassword(),
      }),
    );
    await app.logic.ownerSetup.createOwner(credentials);
    console.log("Owner account created. Public registration remains disabled.");
  } finally {
    await app.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Owner setup failed");
  process.exitCode = 1;
}
