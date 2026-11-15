import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { lint, lintDirectory, oxlint } from "./lint-fixture.ts";
import { coreFiles, feature, type OxlintOutput } from "./lint-test-helpers.ts";

test("runs a project's stricter rule in a second run, with no default rule", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lint-rules-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, feature("notes"), "utils/pay.ts");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    'import stripe from "stripe";\ndebugger;\nexport const pay = stripe;\n',
  );
  // The shape that docs/agents/setup.md gives for `.oxlintrc.project.json`.
  const configPath = path.join(directory, ".oxlintrc.project.json");
  await writeFile(
    configPath,
    JSON.stringify({
      plugins: [],
      categories: { correctness: "off" },
      jsPlugins: [path.join(lintDirectory, "stack-plugin.ts")],
      rules: {
        "stack/vendor-imports": [
          "error",
          {
            vendors: [
              {
                packages: ["stripe"],
                allowedIn: ["^features/[^/]+/services/"],
                where: "a Service implementation",
              },
            ],
          },
        ],
      },
    }),
  );

  const result = spawnSync(oxlint, ["-c", configPath, "-f", "json", "."], {
    cwd: directory,
    encoding: "utf8",
  });

  assert.deepEqual(
    (JSON.parse(result.stdout) as OxlintOutput).diagnostics.map(
      (problem) => problem.code,
    ),
    ["stack(vendor-imports)"],
  );
});

/**
 * A copy of `lint/` beside a `lint.project.json`, because the plugins read that
 * file from their parent directory. Returns the path of the copy.
 */
async function pluginsWithProjectFile(context: TestContext, text: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lint-project-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await cp(lintDirectory, path.join(directory, "lint"), { recursive: true });
  await writeFile(path.join(directory, "lint.project.json"), text);
  return path.join(directory, "lint");
}

test("adds the project's roles, root files, and composition files to the rules", async (context) => {
  const files = {
    ...coreFiles("backend"),
    "backend/src/worker.ts": "export const entry = 1;\n",
    [`${feature("notes")}/jobs/send.ts`]: "export const send = 1;\n",
    [`${feature("rides")}/tiles/read.ts`]: "export const read = 1;\n",
    [`${feature("notes")}/tiles/read.ts`]: "export const read = 1;\n",
    [`${feature("notes")}/utils/wire.ts`]:
      'import { read } from "../../rides/tiles/read.js";\nexport const wired = read;\n',
  };
  const plugins = await pluginsWithProjectFile(
    context,
    JSON.stringify({
      roles: ["jobs"],
      rolesByFeature: { rides: ["tiles"] },
      srcRootFiles: ["worker.ts"],
      compositionFiles: ["features/notes/utils/wire.ts"],
    }),
  );

  const problems = await lint(context, files, { plugins });

  assert.deepEqual(problems, [
    "backend/src/features/notes/tiles/read.ts: architecture(file-layout)",
  ]);
  assert.deepEqual(await lint(context, files), [
    "backend/src/features/notes/jobs/send.ts: architecture(file-layout)",
    "backend/src/features/notes/tiles/read.ts: architecture(file-layout)",
    "backend/src/features/notes/utils/wire.ts: architecture(feature-boundaries)",
    "backend/src/features/rides/tiles/read.ts: architecture(file-layout)",
    "backend/src/worker.ts: architecture(file-layout)",
  ]);
});

test("lets each feature import a project's shared feature, which imports only template-shared features", async (context) => {
  const plugins = await pluginsWithProjectFile(
    context,
    JSON.stringify({ sharedFeatures: ["geo"] }),
  );

  const problems = await lint(
    context,
    {
      ...coreFiles("backend"),
      [`${feature("geo")}/utils/distance.ts`]:
        'import { Logic } from "../../core/logic/logic.js";\nexport const distance = Logic;\n',
      [`${feature("geo")}/utils/reach-types.ts`]:
        'import type { Note } from "../../notes/types.js";\nexport type Reach = Note;\n',
      [`${feature("geo")}/utils/reach-private.ts`]:
        'import { note } from "../../notes/utils/note.js";\nexport const reach = note;\n',
      [`${feature("notes")}/types.ts`]: "export type Note = string;\n",
      [`${feature("notes")}/utils/note.ts`]:
        'import { distance } from "../../geo/utils/distance.js";\nexport const note = distance;\n',
    },
    { plugins },
  );

  assert.deepEqual(problems, [
    "backend/src/features/geo/utils/reach-private.ts: architecture(feature-boundaries)",
    "backend/src/features/geo/utils/reach-types.ts: architecture(feature-boundaries)",
  ]);
});

test("keeps the boundaries when a project lists each feature as shared", async (context) => {
  const plugins = await pluginsWithProjectFile(
    context,
    JSON.stringify({ sharedFeatures: ["notes", "rides"] }),
  );

  const problems = await lint(
    context,
    {
      [`${feature("rides")}/utils/ride.ts`]: "export const ride = 1;\n",
      [`${feature("notes")}/utils/note.ts`]:
        'import { ride } from "../../rides/utils/ride.js";\nexport const note = ride;\n',
    },
    { plugins },
  );

  assert.deepEqual(problems, [
    "backend/src/features/notes/utils/note.ts: architecture(feature-boundaries)",
  ]);
});

test("stops lint when the project file has a key or a value that it cannot read", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lint-rules-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "file.ts"), "export const file = 1;\n");

  const cases: [string, RegExp][] = [
    [
      '{ "rules": { "architecture/file-layout": "off" } }',
      /unknown key "rules"/,
    ],
    ['{ "vendors": [] }', /unknown key "vendors"/],
    ['{ "roles": "workers" }', /"roles" must be a list of names/],
    ['{ "roles": [1] }', /"roles" must be a list of names/],
    ['{ "rolesByFeature": ["rides"] }', /"rolesByFeature" must map/],
    ['{ "rolesByFeature": { "rides": "tiles" } }', /"rolesByFeature" must map/],
    ["{ roles", /JSON/],
  ];
  for (const [text, message] of cases) {
    const plugins = await pluginsWithProjectFile(context, text);
    const configPath = path.join(directory, "oxlintrc.json");
    await writeFile(
      configPath,
      JSON.stringify({
        plugins: [],
        categories: { correctness: "off" },
        jsPlugins: [path.join(plugins, "architecture-plugin.ts")],
      }),
    );

    const result = spawnSync(oxlint, ["-c", configPath, "."], {
      cwd: directory,
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0, text);
    assert.match(`${result.stdout}${result.stderr}`, message, text);
  }
});
