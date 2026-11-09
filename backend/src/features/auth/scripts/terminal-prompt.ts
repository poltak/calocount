import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

interface TerminalQuestions {
  ask(question: string): Promise<string>;
  /** Asks two times, and shows nothing that the person types. */
  askNewPassword(): Promise<string>;
}

/**
 * Ask the person at the terminal. A password comes only from here, because an
 * argument or an environment variable stays in the shell history and in the
 * process list.
 */
export async function withTerminalPrompt<Answers>(
  run: (questions: TerminalQuestions) => Promise<Answers>,
): Promise<Answers> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "This command requires an interactive terminal; passwords are not accepted as arguments",
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
  const ask = (question: string) =>
    prompt.question(question, { signal: cancellation.signal });
  try {
    return await run({
      ask,
      async askNewPassword() {
        process.stdout.write("Password: ");
        hidden = true;
        try {
          const password = await ask("");
          process.stdout.write("\nConfirm password: ");
          const confirmation = await ask("");
          process.stdout.write("\n");
          if (password !== confirmation) {
            throw new Error("Passwords do not match");
          }
          return password;
        } finally {
          hidden = false;
        }
      },
    });
  } finally {
    prompt.close();
    output.end();
  }
}
