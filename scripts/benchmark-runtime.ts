/**
 * Measure built copies of the app in a real browser and in Node: the bytes a
 * first visit downloads, load times, main-thread work, memory, the cost of
 * common interactions, and the work the Worker does for a page.
 *
 * Usage: tsx scripts/benchmark-runtime.ts <label>=<dist directory> [...] [--runs 9] [--json <file>]
 * Example: tsx scripts/benchmark-runtime.ts before=../other-checkout/dist after=dist
 *
 * Every build is served by the same local server, with the same compression
 * and the same mock API data, so the numbers differ only by the build.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { chromium, type Browser, type CDPSession, type Page } from "@playwright/test";

import { mockDashboardApi } from "../tests/browser/mock-api";

type Worker = { fetch: (request: Request, env: unknown, context: unknown) => Promise<Response> };
type Build = {
  label: string;
  dist: string;
  worker: Worker;
  origin: string;
  server: Server;
  served: Map<string, ServedFile>;
  /** Wait this long before each answer, to stand in for the round trip of a mobile network. */
  delayMs: number;
};
type ServedFile = { raw: number; brotli: number; gzip: number };
type Samples = Record<string, number[]>;

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};
const COMPRESSIBLE = new Set([".js", ".css", ".html", ".json", ".webmanifest", ".svg", ".txt"]);
// The throttled profile of Lighthouse for a mid-range phone on a slow 4G connection. The browser limits
// the throughput; the local server adds the round trip, because the browser does not delay local requests.
const SLOW_4G = { offline: false, latency: 0, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const SLOW_4G_ROUND_TRIP_MS = 150;
const CPU_SLOWDOWN = 4;

// Use the Worker runtime supplied by the existing Wrangler development tool.
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve("miniflare", {
  paths: [require.resolve("wrangler/package.json")],
}));

function brotli(body: Buffer) {
  return brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Serve the static files of a build, and pass every other request to its Worker, as Cloudflare does. */
export async function startBuild(label: string, dist: string): Promise<Build> {
  const clientRoot = resolve(dist, "client");
  const { default: worker } = await import(pathToFileURL(resolve(dist, "server/index.js")).href) as { default: Worker };
  const files = new Map<string, { body: Buffer; compressed: Buffer | null; type: string; immutable: boolean }>();
  for (const name of readdirSync(clientRoot, { recursive: true }) as string[]) {
    const path = join(clientRoot, name);
    if (!statSync(path).isFile() || name.split("/").some((part) => part.startsWith(".")) || name.startsWith("_headers")) continue;
    const body = readFileSync(path);
    const extension = extname(name);
    files.set(`/${name}`, {
      body,
      compressed: COMPRESSIBLE.has(extension) ? brotli(body) : null,
      type: CONTENT_TYPES[extension] ?? "application/octet-stream",
      // Both builds mark their content-hashed files as immutable in `_headers`.
      immutable: name.startsWith("assets/") || name.startsWith("_next/static/"),
    });
  }
  const served = new Map<string, ServedFile>();
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const build: Build = { label, dist: resolve(dist), worker, origin: "", server: null as unknown as Server, served, delayMs: 0 };
  // Let the Worker code reach its steady speed before any measurement.
  for (let warmup = 0; warmup < 50; warmup++) await (await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html", host: "localhost" } }), env, context)).text();

  build.server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (build.delayMs > 0) await new Promise((done) => setTimeout(done, build.delayMs));
    const acceptsBrotli = String(request.headers["accept-encoding"] ?? "").includes("br");
    const file = files.get(url.pathname);
    let body: Buffer;
    let headers: Record<string, string>;
    let status = 200;
    if (file) {
      body = file.body;
      headers = { "content-type": file.type, "cache-control": file.immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate" };
    } else {
      const answer = await worker.fetch(new Request(url, { headers: { accept: "text/html", host: url.host } }), env, context);
      body = Buffer.from(await answer.arrayBuffer());
      status = answer.status;
      headers = Object.fromEntries(answer.headers);
    }
    const compressible = file ? file.compressed !== null : (headers["content-type"] ?? "").startsWith("text/html");
    const compressed = compressible ? file?.compressed ?? brotli(body) : null;
    served.set(url.pathname, { raw: body.length, brotli: compressed?.length ?? body.length, gzip: compressible ? gzipSync(body).length : body.length });
    if (compressed && acceptsBrotli) {
      response.writeHead(status, { ...headers, "content-encoding": "br", "content-length": String(compressed.length) });
      response.end(compressed);
    } else {
      response.writeHead(status, { ...headers, "content-length": String(body.length) });
      response.end(body);
    }
  });
  await new Promise<void>((done) => build.server.listen(0, "127.0.0.1", done));
  build.origin = `http://127.0.0.1:${(build.server.address() as AddressInfo).port}`;
  return build;
}

const FOODS = [
  { name: "Oats with milk", calories: 380, proteinG: 16, carbsG: 58, fatG: 9, fiberG: 8, sodiumMg: 120, calciumMg: 260, ironMg: 3.4, saturatedFatG: 3, potassiumMg: 420 },
  { name: "Coffee with milk", calories: 90, proteinG: 4, carbsG: 8, fatG: 4, fiberG: null, sodiumMg: 60, calciumMg: 150, caffeineMg: 120, saturatedFatG: 2.5 },
  { name: "Chicken rice bowl", calories: 640, proteinG: 46, carbsG: 72, fatG: 16, fiberG: 5, sodiumMg: 980, potassiumMg: 760, ironMg: 2.2, saturatedFatG: 4 },
  { name: "Greek yogurt", calories: 150, proteinG: 17, carbsG: 9, fatG: 4, fiberG: 0, sodiumMg: 65, calciumMg: 200, saturatedFatG: 2.5 },
  { name: "Banana", calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4, fiberG: 3.1, potassiumMg: 422, vitaminCMg: 10 },
  { name: "Salmon with potatoes", calories: 560, proteinG: 38, carbsG: 40, fatG: 26, fiberG: 4, sodiumMg: 540, omega3G: 2.1, vitaminDMcg: 14, saturatedFatG: 5 },
  { name: "Mixed salad", calories: 140, proteinG: 4, carbsG: 12, fatG: 9, fiberG: 4.5, sodiumMg: 210, vitaminCMg: 38, vitaminKMcg: 120 },
  { name: "Protein shake", calories: 180, proteinG: 30, carbsG: 8, fatG: 3, fiberG: 1, sodiumMg: 190, calciumMg: 300 },
  { name: "Pasta with tomato sauce", calories: 520, proteinG: 18, carbsG: 92, fatG: 9, fiberG: 7, sodiumMg: 720, ironMg: 3 },
  { name: "Dark chocolate", calories: 170, proteinG: 2, carbsG: 13, fatG: 12, fiberG: 3, saturatedFatG: 7, magnesiumMg: 64, caffeineMg: 22 },
  { name: "Eggs on toast", calories: 340, proteinG: 20, carbsG: 28, fatG: 16, fiberG: 3, sodiumMg: 520, saturatedFatG: 4.5, vitaminB12Mcg: 1.1 },
  { name: "Lentil soup", calories: 290, proteinG: 18, carbsG: 44, fatG: 4, fiberG: 14, sodiumMg: 690, ironMg: 6, folateMcgDfe: 310 },
];

/** Fill the mock API with 37 days of entries, so the page has a realistic amount to show. */
export function seed(state: Awaited<ReturnType<typeof mockDashboardApi>>, today = new Date().toISOString().slice(0, 10)) {
  type MockMeal = (typeof state.meals)[number];
  state.date = today;
  state.meals = [];
  state.weights = [];
  for (let offset = 0; offset < 37; offset++) {
    const day = new Date(Date.parse(today) - offset * 86_400_000).toISOString().slice(0, 10);
    if (offset < 30 && offset % 3 !== 1) state.weights.push({ logicalDate: day, weightKg: 70 + ((offset * 7) % 11) / 10, recordedAt: Date.parse(`${day}T07:00:00Z`) });
    for (const [slot, hour] of [8, 13, 16, 19].entries()) {
      if (offset === 0 && hour > 13) continue;
      const items = [FOODS[(offset * 5 + slot * 3) % FOODS.length], FOODS[(offset * 7 + slot + 4) % FOODS.length]]
        .map((food) => ({ quantity: 1, unit: "serving", ...food }));
      const total = (key: "calories" | "proteinG" | "carbsG" | "fatG") => items.reduce((sum, item) => sum + item[key], 0);
      const hasPhoto = (offset + slot) % 3 === 0;
      const id = `meal-${offset}-${slot}`;
      state.meals.push({
        id, consumedAt: Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`), caption: items.map((item) => item.name).join(", "),
        mealType: ["breakfast", "lunch", "snack", "dinner"][slot], status: "complete",
        totalCalories: total("calories"), totalProteinG: total("proteinG"), totalCarbsG: total("carbsG"), totalFatG: total("fatG"),
        photoKey: hasPhoto ? `meals/owner/${id}/photo` : null, photoMimeType: hasPhoto ? "image/png" : null, hasPhoto, savedEntryId: null,
        items,
      } as unknown as MockMeal);
    }
  }
}

/** Runs in the page before its own code: record when the dashboard shows data, long tasks and paints. */
function installProbes() {
  const probes = { ready: null as number | null, readyPainted: null as number | null, longTasks: [] as { start: number; duration: number }[], lcp: null as number | null };
  (window as unknown as { __probes: typeof probes }).__probes = probes;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) probes.longTasks.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) probes.lcp = entry.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  const observer = new MutationObserver(() => {
    // The day heading exists only when the summary has loaded.
    if (!document.getElementById("today")) return;
    observer.disconnect();
    probes.ready = performance.now();
    requestAnimationFrame(() => setTimeout(() => { probes.readyPainted = performance.now(); }));
  });
  observer.observe(document, { childList: true, subtree: true });
}

async function readProbes(page: Page) {
  return page.evaluate(() => {
    const probes = (window as unknown as { __probes: { ready: number; readyPainted: number; longTasks: { start: number; duration: number }[]; lcp: number | null } }).__probes;
    const paint = performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint");
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return {
      ttfb: navigation.responseStart,
      fcp: paint?.startTime ?? NaN,
      lcp: probes.lcp ?? NaN,
      ready: probes.readyPainted,
      longTaskTotal: probes.longTasks.reduce((sum, task) => sum + task.duration, 0),
      blocking: probes.longTasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
    };
  });
}

async function cdpMetrics(session: CDPSession) {
  const { metrics } = await session.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
}

function push(samples: Samples, values: Record<string, number>) {
  for (const [key, value] of Object.entries(values)) (samples[key] ??= []).push(value);
}

/** Load a page with an empty cache, then again with a warm cache, and record what the browser did. */
async function measureLoads({ browser, build, path, runs, throttled }: { browser: Browser; build: Build; path: string; runs: number; throttled: boolean }) {
  const samples: Samples = {};
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({ timezoneId: "UTC", viewport: throttled ? { width: 412, height: 915 } : { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    seed(await mockDashboardApi(page));
    await page.addInitScript(installProbes);
    const session = await context.newCDPSession(page);
    await session.send("Performance.enable");
    await session.send("Network.enable");
    let transferred = 0;
    session.on("Network.loadingFinished", (event) => { transferred += event.encodedDataLength; });
    build.delayMs = throttled ? SLOW_4G_ROUND_TRIP_MS : 0;
    if (throttled) {
      await session.send("Network.emulateNetworkConditions", SLOW_4G);
      await session.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
    }
    await page.goto(build.origin + path, { waitUntil: "load" });
    await page.waitForFunction(() => (window as unknown as { __probes: { readyPainted: number | null } }).__probes.readyPainted !== null);
    await page.waitForTimeout(700);
    const cold = await readProbes(page);
    const work = await cdpMetrics(session);
    await session.send("HeapProfiler.collectGarbage");
    const settled = await cdpMetrics(session);
    push(samples, {
      "ttfb ms": cold.ttfb, "first contentful paint ms": cold.fcp, "largest contentful paint ms": cold.lcp, "dashboard shown ms": cold.ready,
      "long tasks ms": cold.longTaskTotal, "blocking time ms": cold.blocking,
      "script ms": work.ScriptDuration * 1000, "style and layout ms": (work.LayoutDuration + work.RecalcStyleDuration) * 1000,
      "main thread task ms": work.TaskDuration * 1000, "js heap MB": settled.JSHeapUsedSize / 1_048_576, "dom nodes": settled.Nodes,
      "received kB (files and API data)": transferred / 1024,
    });

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => (window as unknown as { __probes: { readyPainted: number | null } }).__probes.readyPainted !== null);
    const warm = await readProbes(page);
    push(samples, { "repeat visit: dashboard shown ms": warm.ready, "repeat visit: first contentful paint ms": warm.fcp });
    await context.close();
  }
  return samples;
}

/** Time the main-thread work of common actions: the handler, the DOM update, and the style and layout that follow. */
async function measureInteractions({ browser, build, runs }: { browser: Browser; build: Build; runs: number }) {
  const context = await browser.newContext({ timezoneId: "UTC", viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  const page = await context.newPage();
  seed(await mockDashboardApi(page));
  const session = await context.newCDPSession(page);
  // The TypeScript runner wraps named functions in a helper that the page does not have.
  await page.addInitScript("globalThis.__name = (value) => value;");
  await page.goto(`${build.origin}/owner`, { waitUntil: "load" });
  await page.locator("#today").waitFor();
  await page.locator(".days-repeat").waitFor();
  await session.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  const samples = await page.evaluate(async (repeats) => {
    const find = (selector: string, index = 0) => document.querySelectorAll<HTMLElement>(selector)[index];
    const click = (selector: string, index = 0) => () => find(selector, index).click();
    const choose = (selector: string, values: string[]) => (turn: number) => {
      const select = find(selector) as HTMLElement & { value: string };
      select.value = values[turn % values.length];
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const actions: Record<string, (turn: number) => void> = {
      "select another day": (turn) => find(".date-pill", turn % 2 ? 6 : 3).click(),
      "change the trend range": choose(".chart-range-select", ["30", "7"]),
      "open or close an entry's nutrition details": click(".nutrition-details-button"),
      "open or close an entry's edit form": click(".edit-button"),
      "open or close the calendar": click(".calendar-toggle"),
      "change the attention window": (turn) => find(".nutrition-attention__controls button", turn % 2 ? 0 : 1).click(),
      "change the nutrient of the nutrient trend": choose("#nutrient-trend-selector", ["sodiumMg", "fiberG"]),
      "show or hide the insights": click(".insights-overview-heading .nutrition-section-toggle"),
    };
    const results: Record<string, number[]> = {};
    for (const [name, action] of Object.entries(actions)) {
      results[name] = [];
      for (let turn = 0; turn < repeats + 2; turn++) {
        const start = performance.now();
        action(turn);
        // The page applies a change in a microtask. Wait for it, then make the browser do style and layout now.
        await Promise.resolve();
        await Promise.resolve();
        void document.documentElement.offsetHeight;
        const elapsed = performance.now() - start;
        if (turn >= 2) results[name].push(elapsed);
        await new Promise((done) => requestAnimationFrame(() => setTimeout(done, 20)));
      }
    }
    return results;
  }, runs);
  await context.close();
  return samples;
}

/** Run the Worker in workerd, the runtime Cloudflare uses, and time page requests through it. */
async function measureWorkerd(build: Build) {
  const root = join(build.dist, "server");
  const files = (readdirSync(root, { recursive: true }) as string[]).filter((file) => file.endsWith(".js"));
  // The first module is the entry point.
  files.sort((left, right) => left === "index.js" ? -1 : right === "index.js" ? 1 : left.localeCompare(right));
  const start = () => new Miniflare({
    ...convertV4MiniflareOptions({
      modules: files.map((file) => ({ type: "ESModule", path: join(root, file) })),
      modulesRoot: root,
      compatibilityDate: "2026-08-23",
      compatibilityFlags: ["nodejs_compat"],
      bindings: {},
      serviceBindings: { ASSETS: () => new Response("Not found", { status: 404 }) },
    }),
  });
  const request = async (runtime: { dispatchFetch: (url: string, init?: object) => Promise<{ status: number; text: () => Promise<string> }> }) => {
    const answer = await runtime.dispatchFetch("http://localhost/", { headers: { accept: "text/html" } });
    if (answer.status !== 200) throw new Error(`${build.label}: the page answered ${answer.status} in workerd`);
    await answer.text();
  };
  const firstRequests: number[] = [];
  const warmRequests: number[] = [];
  for (let instance = 0; instance < 7; instance++) {
    const runtime = start();
    await runtime.ready;
    const started = performance.now();
    await request(runtime);
    firstRequests.push(performance.now() - started);
    if (instance === 6) {
      for (let warmup = 0; warmup < 100; warmup++) await request(runtime);
      for (let run = 0; run < 400; run++) {
        const begin = performance.now();
        await request(runtime);
        warmRequests.push(performance.now() - begin);
      }
    }
    await runtime.dispose();
  }
  return {
    "workerd: first page request after start ms": median(firstRequests),
    "workerd: page request ms (median of 400)": median(warmRequests),
  };
}

/** The time the Worker takes to answer a page request, and to load its code in a new process. */
async function measureWorker(build: Build) {
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const render = async () => (await build.worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html", host: "localhost" } }), env, context)).text();
  for (let warmup = 0; warmup < 100; warmup++) await render();
  const renders: number[] = [];
  for (let run = 0; run < 500; run++) {
    const start = performance.now();
    await render();
    renders.push(performance.now() - start);
  }
  const entry = pathToFileURL(join(build.dist, "server/index.js")).href;
  const firstRequest = `const start = performance.now(); const { default: worker } = await import(${JSON.stringify(entry)}); const loaded = performance.now(); await (await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html", host: "localhost" } }), { ASSETS: { fetch: async () => new Response("", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} })).text(); console.log(JSON.stringify([loaded - start, performance.now() - loaded]));`;
  const starts = Array.from({ length: 9 }, () => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", firstRequest], { encoding: "utf8" })) as [number, number]);
  const serverFiles = (readdirSync(join(build.dist, "server"), { recursive: true }) as string[]).filter((name) => name.endsWith(".js"));
  const bundle = serverFiles.map((name) => readFileSync(join(build.dist, "server", name)));
  return {
    "Node: page render ms (median of 500)": median(renders),
    "Node: load the code in a new process ms": median(starts.map(([load]) => load)),
    "Node: first page request in a new process ms": median(starts.map(([, first]) => first)),
    "Worker code files": serverFiles.length,
    "Worker code kB": bundle.reduce((sum, file) => sum + file.length, 0) / 1024,
    "Worker code kB (gzip)": bundle.reduce((sum, file) => sum + gzipSync(file).length, 0) / 1024,
    "Worker entry module kB": statSync(join(build.dist, "server/index.js")).size / 1024,
  };
}

function summarise(samples: Samples) {
  return Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, median(values)]));
}

function printTable(title: string, rows: Record<string, Record<string, number>>) {
  const labels = Object.keys(rows);
  const metrics = Object.keys(rows[labels[0]]);
  const format = (value: number) => Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: value < 10 ? 2 : value < 100 ? 1 : 0 }) : "n/a";
  console.log(`\n${title}`);
  console.log(["metric".padEnd(46), ...labels.map((label) => label.padStart(10)), labels.length === 2 ? "change".padStart(9) : ""].join(" "));
  for (const metric of metrics) {
    const values = labels.map((label) => rows[label][metric]);
    const change = labels.length === 2 && values[0] > 0 ? `${(((values[1] - values[0]) / values[0]) * 100).toFixed(0)}%`.padStart(9) : "";
    console.log([metric.padEnd(46), ...values.map((value) => format(value).padStart(10)), change].join(" "));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
  };
  const runs = Number(option("--runs") ?? 9);
  const builds = await Promise.all(args.filter((arg) => /^[\w-]+=/.test(arg)).map((arg) => {
    const [label, ...dist] = arg.split("=");
    return startBuild(label, dist.join("="));
  }));
  if (builds.length === 0) throw new Error("Give at least one <label>=<dist directory>.");
  const browser = await chromium.launch();
  const report: Record<string, Record<string, Record<string, number>>> = {};
  const table = (title: string) => (report[title] ??= {});
  try {
    for (const [path, name] of [["/", "public page"], ["/owner", "owner page"]] as const) {
      for (const throttled of [true, false]) {
        const title = `Load the ${name}, ${throttled ? `phone profile (slow 4G, ${CPU_SLOWDOWN}x slower CPU)` : "desktop profile (no throttling)"}, median of ${runs}`;
        // Alternate the builds so that drift in the machine's load affects both the same.
        const samples: Record<string, Samples> = {};
        for (let round = 0; round < runs; round++) {
          for (const build of builds) {
            const one = await measureLoads({ browser, build, path, runs: 1, throttled });
            for (const [key, values] of Object.entries(one)) ((samples[build.label] ??= {})[key] ??= []).push(...values);
          }
        }
        for (const build of builds) table(title)[build.label] = summarise(samples[build.label]);
      }
    }
    for (const build of builds) {
      table(`Interactions on the owner page, ${CPU_SLOWDOWN}x slower CPU: script, style and layout ms, median of ${runs * 2}`)[build.label] = summarise(await measureInteractions({ browser, build, runs: runs * 2 }));
    }
    for (const build of builds) {
      // The files a first visit to the public page asked for.
      const first = [...build.served].filter(([path]) => path === "/" || /\.(js|css)$/.test(path) && !path.includes("settings-panel"));
      const sum = (kind: keyof ServedFile, test: (path: string) => boolean) => first.filter(([path]) => test(path)).reduce((total, [, file]) => total + file[kind], 0) / 1024;
      table("First visit to the public page: files and sizes")[build.label] = {
        "requests (document, scripts, styles)": first.length,
        "document kB": sum("raw", (path) => path === "/"),
        "document kB (brotli)": sum("brotli", (path) => path === "/"),
        "scripts kB": sum("raw", (path) => path.endsWith(".js")),
        "scripts kB (brotli)": sum("brotli", (path) => path.endsWith(".js")),
        "scripts kB (gzip)": sum("gzip", (path) => path.endsWith(".js")),
        "styles kB": sum("raw", (path) => path.endsWith(".css")),
        "styles kB (brotli)": sum("brotli", (path) => path.endsWith(".css")),
        "total kB (brotli)": sum("brotli", () => true),
      };
      table("Worker")[build.label] = { ...await measureWorkerd(build), ...await measureWorker(build) };
    }
  } finally {
    await browser.close();
    for (const build of builds) build.server.close();
  }
  for (const [title, rows] of Object.entries(report)) printTable(title, rows);
  const output = option("--json");
  if (output) writeFileSync(output, JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
