import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The key comes from stdin, or from the macOS Keychain item `anthropic-api-key`. */
export function readApiKey(fromStdin: boolean): string {
  if (fromStdin) {
    return readFileSync(0, "utf8").trim();
  }
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", "anthropic-api-key", "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    throw new Error(
      "No key. Add it to the Keychain as anthropic-api-key, or pipe it in with --key-stdin.",
    );
  }
}
