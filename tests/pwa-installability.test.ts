import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

type PwaManifest = {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  theme_color?: string;
  background_color?: string;
  icons?: Array<{
    src?: string;
    sizes?: string;
    type?: string;
    purpose?: string;
  }>;
};

async function readPngDimensions(path: string) {
  const file = await readFile(path);
  assert.equal(file.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    bitDepth: file[24],
    colorType: file[25],
  };
}

async function readPngCornerRgb(path: string) {
  const file = await readFile(path);
  const idatChunks: Buffer[] = [];
  let colorType = 0;

  for (let offset = 8; offset + 12 <= file.length; ) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === "IHDR") colorType = file[dataStart + 9] ?? 0;
    if (type === "IDAT") idatChunks.push(file.subarray(dataStart, dataEnd));
    offset = dataEnd + 4;
  }

  assert.equal(colorType, 2);
  const scanline = inflateSync(Buffer.concat(idatChunks));
  return [...scanline.subarray(1, 4)];
}

test("manifest has the fields required for mobile installation", async () => {
  const appManifest = JSON.parse(
    await readFile(`${projectRoot}/public/manifest.webmanifest`, "utf8"),
  ) as PwaManifest;

  assert.equal(appManifest.name, "Calocount — simple calorie tracking");
  assert.equal(appManifest.short_name, "Calocount");
  assert.equal(appManifest.start_url, "/");
  assert.equal(appManifest.scope, "/");
  assert.equal(appManifest.display, "standalone");
  assert.equal(appManifest.theme_color, "#0f131b");
  assert.equal(appManifest.background_color, "#0f131b");

  const icons = appManifest.icons ?? [];
  assert.ok(icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"));
  assert.equal(
    icons.find((icon) => icon.purpose === "maskable")?.src,
    "/icon-512-maskable.png",
  );

  for (const [file, size, colorType] of [
    ["icon-192.png", 192, 6],
    ["icon-512.png", 512, 6],
    ["icon-512-maskable.png", 512, 2],
    ["apple-touch-icon.png", 180, 6],
  ] as const) {
    assert.deepEqual(await readPngDimensions(`${projectRoot}/public/${file}`), {
      width: size,
      height: size,
      bitDepth: 8,
      colorType,
    });
  }

  assert.deepEqual(await readPngCornerRgb(`${projectRoot}/public/icon-512-maskable.png`), [15, 19, 27]);
});

test("the app registers and serves a network-only service worker", async () => {
  const registration = await readFile(`${projectRoot}/app/pwa-registration.tsx`, "utf8");
  const serviceWorker = await readFile(`${projectRoot}/public/sw.js`, "utf8");

  assert.match(registration, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(serviceWorker, /addEventListener\("fetch"/);
  assert.match(serviceWorker, /event\.respondWith\(fetch\(request\)\)/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(serviceWorker, /caches\.(open|match|put)/);
});

test("layout emits one credentialed manifest link for Access-protected installs", async () => {
  const layout = await readFile(`${projectRoot}/app/layout.tsx`, "utf8");

  assert.equal((layout.match(/rel="manifest"/g) ?? []).length, 1);
  assert.match(
    layout,
    /<link rel="manifest" href="\/manifest\.webmanifest" crossOrigin="use-credentials" \/>/,
  );
  assert.doesNotMatch(layout, /^\s*manifest\s*:/m);
  await assert.rejects(access(`${projectRoot}/app/manifest.ts`));
});
