import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(root, "scripts/check-shadcn.mjs");
const ui = "frontend/src/features/core/ui/shadcn/";

async function fixture(context, changes = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shadcn-fixture-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const files = {
    "package.json": JSON.stringify({
      type: "module",
      devDependencies: { shadcn: "4.23.0" },
    }),
    "frontend/package.json": "{}",
    "frontend/components.json": JSON.stringify({
      style: "base-mira",
      tailwind: { css: "src/features/core/ui/shadcn.css" },
    }),
    "frontend/src/features/core/ui/shadcn.css": "@import 'tailwindcss';",
    "scripts/shadcn-components.json": '["button"]',
    "node_modules/shadcn/package.json": JSON.stringify({
      version: "4.23.0",
      type: "module",
      main: "dist/index.js",
    }),
    "node_modules/shadcn/dist/index.js": `
      import {mkdirSync, writeFileSync} from 'node:fs';
      import path from 'node:path';
      const args=process.argv.slice(2);
      if(args[0]!=='add'||!args.includes('button')||!args.includes('--overwrite')) process.exit(2);
      if(args.filter((arg)=>arg==='button').length!==1) process.exit(3);
      if(args.filter((arg)=>arg==='avatar').length>1) process.exit(3);
      const directory=path.join(args[args.indexOf('--cwd')+1], 'src/features/core/ui/shadcn');
      mkdirSync(directory,{recursive:true});
      writeFileSync(path.join(directory,'button.tsx'),'export const Button = "generated";\\n');
      writeFileSync(path.join(directory,'helper.ts'),'export const helper = true;\\n');
      if(args.includes('avatar')) {
        writeFileSync(path.join(directory,'avatar.tsx'),'export const Avatar = "generated";\\n');
        mkdirSync(path.join(directory,'helpers'),{recursive:true});
        writeFileSync(path.join(directory,'helpers/avatar.ts'),'export const avatarHelper = true;\\n');
      }
    `,
    [ui + "button.tsx"]: 'export const Button = "generated";\n',
    [ui + "helper.ts"]: "export const helper = true;\n",
    ...changes,
  };
  await mkdir(path.join(directory, "frontend/node_modules"), {
    recursive: true,
  });
  for (const [filename, content] of Object.entries(files)) {
    if (content === null) continue;
    const target = path.join(directory, filename);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return spawnSync(process.execPath, [script, "--root", directory], {
    encoding: "utf8",
  });
}

test("regenerates installed components and their helper files without a registry connection", async (context) => {
  const result = await fixture(context);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked 2 shadcn files with CLI 4.23.0/);
});

const projectComponents = {
  "scripts/shadcn-components.project.json": '["button", "avatar", "avatar"]',
  [ui + "avatar.tsx"]: 'export const Avatar = "generated";\n',
  [ui + "helpers/avatar.ts"]: "export const avatarHelper = true;\n",
};

test("regenerates both lists, removes duplicates, and checks project helper files", async (context) => {
  const result = await fixture(context, projectComponents);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked 4 shadcn files/);
});

test("accepts an empty project list", async (context) => {
  const result = await fixture(context, {
    "scripts/shadcn-components.project.json": "[]",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("still rejects a template component edit when a project adds components", async (context) => {
  const result = await fixture(context, {
    ...projectComponents,
    [ui + "button.tsx"]: "hand edit",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /button\.tsx/);
});

for (const filename of ["avatar.tsx", "helpers/avatar.ts"])
  for (const content of [null, "hand edit"])
    test(`rejects a missing or edited project file ${filename}: ${content}`, async (context) => {
      const result = await fixture(context, {
        ...projectComponents,
        [ui + filename]: content,
      });
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(filename), result.stderr);
    });

for (const content of ['{"avatar": true}', '["avatar", null]', '[""]', "{"])
  test(`rejects an invalid project list: ${content}`, async (context) => {
    const result = await fixture(context, {
      "scripts/shadcn-components.project.json": content,
    });
    assert.equal(result.status, 1);
  });

test(
  "lists each template shadcn file separately and keeps the project list project-owned",
  {
    skip: existsSync(path.join(root, "template-version.json")),
  },
  async () => {
    const { templateOwned, projectOwned } = JSON.parse(
      await readFile(path.join(root, "scripts/template-paths.json"), "utf8"),
    );
    const filenames = await readdir(path.join(root, ui));
    assert.deepEqual(
      templateOwned.filter((entry) => entry.startsWith(ui)).sort(),
      filenames.map((filename) => ui + filename).sort(),
    );
    assert.ok(projectOwned.includes("scripts/shadcn-components.project.json"));
    assert.deepEqual(
      JSON.parse(
        await readFile(
          path.join(root, "scripts/shadcn-components.project.json"),
          "utf8",
        ),
      ),
      [],
    );
  },
);

for (const [name, changes, expected] of [
  ["edited", { [ui + "button.tsx"]: "hand edit" }, "button.tsx"],
  ["missing", { [ui + "button.tsx"]: null }, "button.tsx"],
  ["extra", { [ui + "extra.tsx"]: "new file" }, "extra.tsx"],
  ["edited helper", { [ui + "helper.ts"]: "hand edit" }, "helper.ts"],
])
  test(`rejects an ${name} file and gives the repair command`, async (context) => {
    const result = await fixture(context, changes);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(expected), result.stderr);
    assert.match(result.stderr, /shadcn add --cwd frontend --yes --overwrite/);
    assert.match(result.stderr, /core\/ui\/registry/);
  });

test("rejects a version range before generation", async (context) => {
  const result = await fixture(context, {
    "package.json": JSON.stringify({ devDependencies: { shadcn: "^4.23.0" } }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exact dev dependency/);
});

test("rejects an installed CLI that differs from the pin", async (context) => {
  const result = await fixture(context, {
    "node_modules/shadcn/package.json": JSON.stringify({
      version: "4.22.0",
      type: "module",
      main: "dist/index.js",
    }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match the pin/);
});

test("reports a failed generator rather than a pass", async (context) => {
  const result = await fixture(context, {
    "node_modules/shadcn/dist/index.js":
      'console.error("fixture failure"); process.exit(1);',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /The pinned CLI failed/);
  assert.match(result.stderr, /fixture failure/);
});

test("the local and CI checks both run the generation check", async () => {
  const pkg = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  assert.equal(pkg.scripts["check:shadcn"], "node scripts/check-shadcn.mjs");
  assert.match(pkg.scripts.check, /check:/);
  assert.match(pkg.scripts["ci:checks"], /check:/);
  assert.match(
    await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"),
    /pnpm run ci:checks/,
  );
});

// A template component that templateOwned does not list is open to a hand edit
// in each project, because the list names files and not the folder.
test("lists each template shadcn file in templateOwned", async (context) => {
  const projectList = JSON.parse(
    await readFile(
      path.join(root, "scripts/shadcn-components.project.json"),
      "utf8",
    ).catch(() => "[]"),
  );
  if (projectList.length > 0) {
    context.skip("The project adds its own shadcn components.");
    return;
  }
  const { templateOwned } = JSON.parse(
    await readFile(path.join(root, "scripts/template-paths.json"), "utf8"),
  );
  const files = await readdir(path.join(root, ui), { recursive: true });
  for (const file of files) {
    if (!/\.tsx?$/.test(file)) continue;
    assert.ok(
      templateOwned.includes(`${ui}${file}`),
      `Add ${ui}${file} to templateOwned in scripts/template-paths.json.`,
    );
  }
});
