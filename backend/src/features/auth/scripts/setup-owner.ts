import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createApp } from "../../core/live/index.js";

async function credentials() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Owner setup requires an interactive terminal; passwords are not accepted as arguments",
    );
  }
  let hidden = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!hidden) {
        process.stdout.write(chunk);
      }
      callback();
    },
  });
  const prompt = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  const cancellation = new AbortController();
  prompt.on("SIGINT", () => cancellation.abort());
  try {
    const name =
      (
        await prompt.question("Owner name [Owner]: ", {
          signal: cancellation.signal,
        })
      ).trim() || "Owner";
    process.stdout.write("Password: ");
    hidden = true;
    const password = await prompt.question("", { signal: cancellation.signal });
    process.stdout.write("\nConfirm password: ");
    const confirmation = await prompt.question("", {
      signal: cancellation.signal,
    });
    process.stdout.write("\n");
    if (password !== confirmation) {
      throw new Error("Passwords do not match");
    }
    return { name, password };
  } finally {
    prompt.close();
    output.end();
  }
}

try {
  const app = createApp();
  try {
    await app.services.auth.migrate();
    await app.logic.ownerSetup.initialize();
    await app.logic.ownerSetup.createOwner(await credentials());
    console.log("Owner account created. Public registration remains disabled.");
  } finally {
    await app.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Owner setup failed");
  process.exitCode = 1;
}
