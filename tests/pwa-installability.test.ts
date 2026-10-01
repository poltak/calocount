import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { inflateSync } from "node:zlib";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

type PwaManifest = {
  name?: string;
  short_name?: string;
  id?: string;
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
  assert.equal(appManifest.id, "/");
  assert.equal(appManifest.start_url, "/owner");
  assert.equal(appManifest.scope, "/");
  assert.equal(appManifest.display, "standalone");
  assert.equal(appManifest.theme_color, "#0f131b");
  assert.equal(appManifest.background_color, "#0f131b");

  const icons = appManifest.icons ?? [];
  assert.ok(icons.some((icon) => icon.src === "/icon-192.png" && icon.sizes === "192x192" && icon.type === "image/png" && icon.purpose === "any"));
  assert.ok(icons.some((icon) => icon.src === "/icon-512.png" && icon.sizes === "512x512" && icon.type === "image/png" && icon.purpose === "any"));
  assert.deepEqual(icons.find((icon) => icon.purpose === "maskable"), {
    src: "/icon-512-maskable.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  });
  for (const icon of icons) {
    const src = icon.src;
    assert.ok(src?.startsWith("/"));
    await access(`${projectRoot}/public${src}`);
  }

  for (const [file, size, colorType] of [
    ["favicon-16.png", 16, 6],
    ["favicon-32.png", 32, 6],
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
  await Promise.all([
    access(`${projectRoot}/public/favicon.svg`),
    access(`${projectRoot}/public/favicon.ico`),
  ]);
});

/** Load public/sw.js with a fake worker scope and return its event listeners. */
async function loadServiceWorker() {
  const source = await readFile(`${projectRoot}/public/sw.js`, "utf8");
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const fetched: unknown[] = [];
  const scope = {
    location: { origin: "https://calocount.example" },
    addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
      listeners.set(type, listener);
    },
    skipWaiting: async () => "skipped",
    clients: { claim: async () => "claimed" },
  };
  runInNewContext(source, {
    self: scope,
    URL,
    fetch(request: unknown) {
      fetched.push(request);
      return Promise.resolve("network-response");
    },
    // Any use of the Cache API would throw here: the worker must stay network-only.
    caches: new Proxy({}, { get() { throw new Error("The service worker must not use the Cache API."); } }),
  });
  return { listeners, fetched };
}

test("the service worker passes same-origin page requests to the network and never caches", async () => {
  const { listeners, fetched } = await loadServiceWorker();
  const fetchListener = listeners.get("fetch");
  assert.ok(fetchListener);

  const dispatch = (url: string, method = "GET") => {
    const request = { url, method };
    let responded: unknown;
    fetchListener({ request, respondWith(value: unknown) { responded = value; } });
    return { request, responded };
  };

  const page = dispatch("https://calocount.example/owner");
  assert.equal(await page.responded, "network-response");
  assert.deepEqual(fetched, [page.request]);

  // API calls, writes and other origins are left to the browser.
  for (const [url, method] of [
    ["https://calocount.example/api/dashboard/summary", "GET"],
    ["https://calocount.example/owner", "POST"],
    ["https://other.example/script.js", "GET"],
  ] as const) {
    assert.equal(dispatch(url, method).responded, undefined, `${method} ${url}`);
  }
  assert.equal(fetched.length, 1);
});

test("the service worker activates immediately and claims open pages", async () => {
  const { listeners } = await loadServiceWorker();
  for (const [type, expected] of [["install", "skipped"], ["activate", "claimed"]] as const) {
    let waited: unknown;
    listeners.get(type)?.({ waitUntil(value: unknown) { waited = value; } });
    assert.equal(await waited, expected, type);
  }
});
