import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sites } from "@openai/sites-vite-plugin";
import { defineConfig, type Plugin, type ViteBuilder } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const CLIENT_ENTRY = "app/ui/client.ts";
const CLIENT_OUT_DIR = "dist/client";

type ManifestChunk = { file: string; css?: string[]; imports?: string[] };

/**
 * Tell the Worker the names of the built browser files, so its pages can
 * link them. The dev server gives the source file instead.
 */
function clientAssets(): Plugin {
  const id = "virtual:client-assets";
  let serving = false;
  return {
    name: "calocount:client-assets",
    configResolved(config) {
      serving = config.command === "serve";
    },
    resolveId(source) {
      return source === id ? `\0${id}` : null;
    },
    load(resolved) {
      if (resolved !== `\0${id}`) return null;
      if (serving) return `export default ${JSON.stringify({ scripts: ["/@vite/client", `/${CLIENT_ENTRY}`], styles: [], preloads: [] })};`;
      const manifest = JSON.parse(readFileSync(resolve(CLIENT_OUT_DIR, ".vite/manifest.json"), "utf8")) as Record<string, ManifestChunk>;
      const entry = manifest[CLIENT_ENTRY];
      return `export default ${JSON.stringify({
        scripts: [`/${entry.file}`],
        styles: (entry.css ?? []).map((file) => `/${file}`),
        preloads: (entry.imports ?? []).map((name) => `/${manifest[name].file}`),
      })};`;
    },
  };
}

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      port: 3000,
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    preview: { port: 3000 },
    environments: {
      client: {
        build: {
          outDir: CLIENT_OUT_DIR,
          manifest: true,
          rollupOptions: { input: CLIENT_ENTRY },
        },
      },
    },
    builder: {
      // The Worker reads the manifest of the browser build, so the browser build runs first.
      async buildApp(builder: ViteBuilder) {
        await builder.build(builder.environments.client);
        await builder.build(builder.environments.server);
      },
    },
    plugins: [
      clientAssets(),
      sites(),
      cloudflare({ viteEnvironment: { name: "server" } }),
    ],
  };
});
