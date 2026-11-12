import assert from "node:assert/strict";
import test from "node:test";
import { lint } from "./lint-fixture.mjs";

const page = "frontend/src/features/notes/ui/page.tsx";
const part = (name) => `frontend/src/features/core/ui/${name}/example.tsx`;
const onlyUi = (problems) =>
  problems.filter((problem) => /stack\(page-/.test(problem));

test("pages cannot import or re-export Base UI through any import syntax", async (context) => {
  const files = {};
  for (const [name, source] of Object.entries({
    named: 'import { Button } from "@base-ui/react/button";',
    root: 'import * as Base from "@base-ui/react";',
    reexport: 'export { Button } from "@base-ui/react/button";',
    star: 'export * from "@base-ui/react/dialog";',
    dynamic: 'const base = import("@base-ui/react/button");',
    require: 'const base = require("@base-ui/react/button");',
  }))
    files[`frontend/src/features/notes/ui/${name}.tsx`] = source;
  assert.equal(onlyUi(await lint(context, files)).length, 6);
});

test("only the three shared UI layers can import Base UI and use arbitrary classes", async (context) => {
  const source =
    'import { Button } from "@base-ui/react/button"; export const Example = () => <div className="gap-[13px] p-18 w-[200px]" />;';
  const files = Object.fromEntries(
    ["shadcn", "core", "registry", "components"].map((name) => [
      part(name),
      source,
    ]),
  );
  const problems = onlyUi(await lint(context, files));
  assert.equal(problems.length, 5);
  assert.ok(
    problems.every((problem) => problem.startsWith(part("components"))),
  );
});

test("icon imports follow components.json and permit brand logos", async (context) => {
  for (const [library, allowed, refused] of [
    ["lucide", "lucide-react", "@tabler/icons-react"],
    ["tabler", "@tabler/icons-react", "lucide-react"],
  ]) {
    const problems = onlyUi(
      await lint(context, {
        "frontend/components.json": JSON.stringify({ iconLibrary: library }),
        [page]: `import { Icon } from "${allowed}"; import { Brand } from "simple-icons"; export const icons = [Icon, Brand];`,
        "frontend/src/features/notes/ui/refused.tsx": `import { Icon } from "${refused}"; export { Icon };`,
      }),
    );
    assert.deepEqual(problems, [
      "frontend/src/features/notes/ui/refused.tsx: stack(page-imports)",
    ]);
  }
});

test("bracket values fail in JSX, class functions, variants, and templates", async (context) => {
  for (const source of [
    'export const View = () => <div className="hover:w-[13px]" />;',
    'export const classes = cn("h-[3rem]");',
    'export const classes = cva("p-2", { variants: { tone: { wide: "gap-[7px]" } } });',
    "export const classes = `p-2 ${variant} [padding:3px]`;",
    'export const classes = "[&:hover]:bg-[#fff]";',
  ])
    assert.ok(
      onlyUi(await lint(context, { [page]: source })).length > 0,
      source,
    );
});

test("padding and spacing use the small scale, including variants and logical directions", async (context) => {
  assert.deepEqual(
    onlyUi(
      await lint(context, {
        [page]:
          'export const classes = "gap-0 gap-x-1.5 space-y-3 space-x-reverse p-2.5 ps-3.5 md:px-4 hover:gap-6 data-[open]:pe-8! [&:hover]:py-0.5";',
      }),
    ),
    [],
  );
  for (const token of [
    "gap-5",
    "gap-x-7",
    "space-y-12",
    "p-18",
    "ps-9",
    "md:py-5",
    "hover:p-(--custom)",
  ]) {
    assert.deepEqual(
      onlyUi(
        await lint(context, { [page]: `export const classes = "${token}";` }),
      ),
      [`${page}: stack(page-classes)`],
    );
  }
});

test("a CSS selector is not a Tailwind arbitrary value", async (context) => {
  assert.deepEqual(
    onlyUi(
      await lint(context, {
        [page]: 'export const selector = "h1, [role=heading]";',
      }),
    ),
    [],
  );
});

test("migrated controls have no legacy import or class exceptions", async (context) => {
  const files = Object.fromEntries(
    [
      "button",
      "badge",
      "menu",
      "tabs",
      "card",
      "dialog",
      "disclosure",
      "info-tip",
    ].map((name) => [
      `frontend/src/features/core/ui/components/${name}.tsx`,
      `import { Control } from "@base-ui/react/${name === "badge" ? "use-render" : name}"; export const classes = "w-[13px]";`,
    ]),
  );
  assert.equal(onlyUi(await lint(context, files)).length, 16);
});

test("the frontend alias keeps feature and layer boundaries", async (context) => {
  const problems = await lint(context, {
    [page]:
      'import { privateThing } from "@/features/other/ui/private"; export { privateThing };',
    "frontend/src/features/notes/ui/core.tsx":
      'import { Button } from "@/features/core/ui/shadcn/button"; export { Button };',
    "frontend/src/features/notes/services/wrong-service.ts":
      'import { Storage } from "@/features/notes/storage/note-storage"; export class WrongService { constructor(storage: Storage) {} }',
  });
  assert.ok(problems.includes(`${page}: architecture(feature-boundaries)`));
  assert.ok(
    problems.some((problem) =>
      problem.includes("wrong-service.ts: architecture(layer-imports)"),
    ),
  );
  assert.ok(!problems.some((problem) => problem.includes("ui/core.tsx")));
});

test("only generated files can use React namespace imports and local state", async (context) => {
  const source =
    'import * as React from "react"; export function View() { const [open] = React.useState(false); return <div>{open}</div>; }';
  const problems = await lint(context, {
    [part("shadcn")]: source,
    [part("core")]: source,
    [page]: source,
  });
  assert.ok(
    !problems.some((problem) => problem.startsWith(part("shadcn"))),
    JSON.stringify(problems),
  );
  assert.ok(problems.includes(`${part("core")}: stack(no-component-state)`));
  assert.ok(problems.includes(`${page}: stack(no-component-state)`));
});
