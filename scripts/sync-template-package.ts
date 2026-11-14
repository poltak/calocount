// The merge of a `package.json` by keys, for a conflict that Git cannot merge.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { formatted, git } from "./template-files.ts";
import { DEPENDENCY_LISTS, read, root } from "./sync-template-common.ts";

type JsonObject = Record<string, unknown>;

interface MergeResult {
  merged: JsonObject;
  conflicts: string[];
  keptRemoved: string[];
}

/**
 * Merge two changed versions of a JSON object, key by key. Git merges a
 * `package.json` by its lines. A template commit that changes a version, and
 * a project that added a dependency on the next line, then conflict. By keys,
 * the two changes are to different keys, and they do not conflict.
 *
 * Returns the paths of the keys that both sides changed to different values,
 * and the dependencies that the project removed and the template updated.
 * Such a dependency stays out of the project, because the project has no use
 * for its new version.
 */
const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// pnpm keeps each list of dependencies in order. An object whose keys were
// in order stays in order.
const isOrdered = (names: string[]) =>
  names.every((name, index) => index === 0 || (names[index - 1] ?? "") < name);

function mergeJson({
  base,
  ours,
  theirs,
  at = [],
}: {
  base: JsonObject | undefined;
  ours: JsonObject;
  theirs: JsonObject;
  at?: string[];
}): MergeResult {
  const keys = Object.keys(ours);
  for (const key of Object.keys(theirs)) {
    if (keys.includes(key)) {
      continue;
    }
    // A new key goes after the key that it follows in the template's file.
    const before = Object.keys(theirs)
      .slice(0, Object.keys(theirs).indexOf(key))
      .findLast((candidate) => keys.includes(candidate));
    keys.splice(before === undefined ? 0 : keys.indexOf(before) + 1, 0, key);
  }

  const merged: JsonObject = {};
  const conflicts: string[] = [];
  const keptRemoved: string[] = [];
  for (const key of keys) {
    const sides: Record<"base" | "ours" | "theirs", JsonObject | undefined> = {
      base,
      ours,
      theirs,
    };
    const same = (left: keyof typeof sides, right: keyof typeof sides) =>
      Object.hasOwn(sides[left] ?? {}, key) ===
        Object.hasOwn(sides[right] ?? {}, key) &&
      isDeepStrictEqual(sides[left]?.[key], sides[right]?.[key]);

    let from: keyof typeof sides = "ours";
    if (!same("ours", "theirs")) {
      if (same("base", "ours")) {
        from = "theirs";
      } else if (!same("base", "theirs")) {
        if (isObject(ours[key]) && isObject(theirs[key])) {
          const baseValue = base?.[key];
          const inner = mergeJson({
            base: isObject(baseValue) ? baseValue : {},
            ours: ours[key],
            theirs: theirs[key],
            at: [...at, key],
          });
          merged[key] = inner.merged;
          conflicts.push(...inner.conflicts);
          keptRemoved.push(...inner.keptRemoved);
          continue;
        }
        const projectRemoved =
          at.length === 1 &&
          DEPENDENCY_LISTS.includes(at[0] ?? "") &&
          !Object.hasOwn(ours, key);
        (projectRemoved ? keptRemoved : conflicts).push([...at, key].join("."));
      }
    }
    const source = sides[from];
    if (source !== undefined && Object.hasOwn(source, key)) {
      merged[key] = source[key];
    }
  }

  if (isOrdered(Object.keys(ours)) && !isOrdered(Object.keys(merged))) {
    return {
      merged: Object.fromEntries(
        Object.entries(merged).toSorted(([left], [right]) =>
          left < right ? -1 : 1,
        ),
      ),
      conflicts,
      keptRemoved,
    };
  }
  return { merged, conflicts, keptRemoved };
}

/**
 * Resolve a `package.json` that Git could not merge. Returns the keys that
 * need a person, or `undefined` when a merge by keys is not possible.
 */
export async function mergePackageJson(
  file: string,
): Promise<string[] | undefined> {
  const versions = [1, 2, 3].map((stage): JsonObject | undefined => {
    const { status, stdout } = git({
      root,
      args: ["show", `:${stage}:${file}`],
      allowFailure: true,
    });
    try {
      return status === 0 ? (JSON.parse(stdout) as JsonObject) : undefined;
    } catch {
      return undefined;
    }
  });
  if (versions.includes(undefined)) {
    // One side deleted the file, or one version is not JSON.
    return undefined;
  }
  const [base, ours, theirs] = versions;
  if (ours === undefined || theirs === undefined) {
    return undefined;
  }
  const { merged, conflicts, keptRemoved } = mergeJson({ base, ours, theirs });
  if (conflicts.length > 0) {
    return conflicts;
  }
  for (const key of keptRemoved) {
    console.log(
      `      ${file}: the template updates ${key}. The project removed it, so it stays removed.`,
    );
  }

  const target = path.join(root, file);
  writeFileSync(
    target,
    await formatted({
      file: target,
      text: `${JSON.stringify(merged, null, 2)}\n`,
    }),
  );
  read("add", "--", file);
  return [];
}
