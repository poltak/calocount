// Helpers that the architecture rule modules share.
import { describeFile } from "./paths.ts";
import type { FileDescription } from "./paths.ts";
import type { RuleContext } from "./plugin-types.ts";

export const DOC = "See docs/agents/code-architecture.md";

export function currentFile(context: RuleContext): FileDescription | null {
  return describeFile(context.filename ?? context.getFilename());
}
