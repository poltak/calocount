/**
 * What a project adds to the lint rules, in `lint.project.json` at the root of
 * the repository. `.oxlintrc.json` comes from the template, so a project has
 * no other place for a role or a shared feature of its own.
 *
 * A value here adds to a list in `.oxlintrc.json`, and cannot remove one. A
 * rule that must be stricter needs no key here, because a project can run
 * oxlint a second time with its own config. docs/agents/setup.md has both.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = "lint.project.json";
const LISTS = ["compositionFiles", "roles", "sharedFeatures", "srcRootFiles"];

const isNames = (value) =>
  Array.isArray(value) && value.every((name) => typeof name === "string");
const isNamesByFeature = (value) =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(isNames);

/** A wrong key stops lint. Without this, a typo looks like a rule that passes. */
function validate(options) {
  for (const [key, value] of Object.entries(options)) {
    if (key === "rolesByFeature") {
      if (!isNamesByFeature(value)) {
        throw new Error(`${FILE}: "${key}" must map a feature to its roles.`);
      }
    } else if (!LISTS.includes(key)) {
      throw new Error(`${FILE}: unknown key "${key}".`);
    } else if (!isNames(value)) {
      throw new Error(`${FILE}: "${key}" must be a list of names.`);
    }
  }
}

function read() {
  const file = fileURLToPath(new URL(`../${FILE}`, import.meta.url));
  const options = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {};
  validate(options);
  return {
    compositionFiles: [],
    roles: [],
    rolesByFeature: {},
    sharedFeatures: [],
    srcRootFiles: [],
    ...options,
  };
}

/** A project that has no file reads the empty lists. */
export const projectOptions = read();
