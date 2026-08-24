import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("meal photos use lazy authenticated thumbnails and preserve a placeholder fallback", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /photoKey: string \| null/);
  assert.match(page, /photoMimeType: string \| null/);
  assert.match(page, /photoUrlForKey\(meal\.photoKey\)/);
  assert.match(page, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(page, /loading="lazy"/);
  assert.match(page, /decoding="async"/);
  assert.match(page, /onError=\{\(\) => markPhotoUnavailable\(meal\.photoKey as string\)\}/);
  assert.match(page, /className=\{`meal-avatar \$\{meal\.kind\}`\} aria-hidden="true"/);
});

test("photo preview has an accessible dialog, close controls, and a bounded mobile layout", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="photo-preview-backdrop"/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(page, /aria-label="Close photo preview"/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /event\.target === event\.currentTarget/);
  assert.match(page, /className="photo-preview-image"/);
  assert.match(page, /className="photo-preview-fallback" role="status"/);
  assert.match(css, /\.photo-preview-backdrop \{[\s\S]*?position: fixed;[\s\S]*?inset: 0;/);
  assert.match(css, /\.photo-preview-dialog \{[\s\S]*?width: min\(100%, 720px\);/);
  assert.match(css, /\.photo-preview-image \{[\s\S]*?max-width: 100%;/);
});
