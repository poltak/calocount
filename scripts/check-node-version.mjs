import { readFile } from "node:fs/promises";

// .nvmrc serves nvm and CI, engines.node serves install checks, and
// devEngines.runtime makes pnpm run scripts on that exact Node version.
const rootUrl = new URL("../", import.meta.url);
const nvmrc = (await readFile(new URL(".nvmrc", rootUrl), "utf8")).trim();
const packageJson = JSON.parse(
  await readFile(new URL("package.json", rootUrl), "utf8"),
);

const declared = {
  ".nvmrc": nvmrc,
  "package.json engines.node": packageJson.engines?.node,
  "package.json devEngines.runtime.version":
    packageJson.devEngines?.runtime?.version,
};
const mismatched = Object.entries(declared).filter(
  ([, version]) => version !== nvmrc,
);
if (mismatched.length > 0) {
  console.error(
    `Node versions must match .nvmrc (${nvmrc}):\n${mismatched
      .map(([source, version]) => `  ${source}: ${version}`)
      .join("\n")}`,
  );
  process.exit(1);
}

const running = process.version.replace(/^v/, "");
if (running !== nvmrc) {
  console.error(
    `Running Node ${running}, expected ${nvmrc}. Run Node through pnpm so it uses the pinned runtime.`,
  );
  process.exit(1);
}
