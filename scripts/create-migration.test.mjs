import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const database = new URL(
  "../backend/src/features/core/database/",
  import.meta.url,
);

test("the migration list gives each file its own name", async () => {
  const list = await readFile(new URL("migrations.ts", database), "utf8");
  const files = (await readdir(new URL("migrations/", database)))
    .map((file) => file.replace(/\.ts$/, ""))
    .sort();

  const imported = new Map(
    [
      ...list.matchAll(
        /migration as (\w+) \} from "\.\/migrations\/(.+)\.js"/g,
      ),
    ].map(([, identifier, file]) => [identifier, file]),
  );
  const named = [...list.matchAll(/name: "([^"]+)",\s*\.\.\.(\w+)/g)].map(
    ([, name, identifier]) => ({ name, file: imported.get(identifier) }),
  );

  assert.deepEqual(
    named,
    files.map((file) => ({ name: file, file })),
  );
});
