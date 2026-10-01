import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

/** Render a page from the built Worker, as a browser would request it. */
async function render(path) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
  return { response, html: await response.text() };
}

test("the root server-renders the public read-only dashboard", async () => {
  const { response, html } = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, /<title>Calocount — simple calorie tracking<\/title>/i);
  assert.match(html, /Public read-only/);
  assert.match(html, /Loading public dashboard/);
  assert.match(html, /Open owner view/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /Loading your saved log/);
  assert.doesNotMatch(html, /Demo mode/);
});

test("the owner route server-renders the private dashboard shell", async () => {
  const { response, html } = await render("/owner");
  assert.equal(response.status, 200);
  assert.match(html, /Loading your saved log/);
  assert.doesNotMatch(html, /Public read-only|Open owner view|Loading public dashboard/);
});

test("the privacy route renders the required policy statements without contact details", async () => {
  const { response, html } = await render("/privacy");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  for (const statement of [
    "Privacy Policy",
    "personal, single-user food and drink logging service",
    "optional entry photo",
    "Cloudflare D1",
    "Cloudflare R2",
    "Temporary OpenAI file links are downloaded immediately",
    "We do not sell",
    "HTTPS and access controls",
    "request access to, correction of, or deletion",
    "August 30, 2026",
  ]) {
    assert.ok(html.toLowerCase().includes(statement.toLowerCase()), statement);
  }
  assert.doesNotMatch(html, /mailto:|[\w.+-]+@[\w-]+\.[\w.]+/);
});

test("every page links one credentialed manifest, the icons and both theme colors", async () => {
  for (const path of ["/", "/owner", "/privacy"]) {
    const { html } = await render(path);
    assert.match(html, /<html lang="en"/, path);
    assert.equal((html.match(/rel="manifest"/g) ?? []).length, 1, path);
    // Access-protected installs need the manifest request to carry credentials.
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" crossorigin="use-credentials"\/>/, path);
    assert.match(html, /<meta name="theme-color" content="#f5f7f6" media="\(prefers-color-scheme: light\)"\/>/, path);
    assert.match(html, /<meta name="theme-color" content="#0f131b" media="\(prefers-color-scheme: dark\)"\/>/, path);
    assert.match(html, /<meta name="color-scheme" content="light dark"\/>/, path);
    for (const icon of ["/favicon.svg", "/favicon-16.png", "/favicon-32.png", "/favicon.ico", "/apple-touch-icon.png"]) {
      assert.ok(html.includes(`href="${icon}"`), `${path} links ${icon}`);
    }
  }
});

/** Run the inline theme script against a minimal document, as the browser does before hydration. */
function runThemeInitializer(script, { stored, prefersLight, storageThrows = false }) {
  const root = { dataset: {}, style: {} };
  vm.runInNewContext(script, {
    window: {
      localStorage: {
        getItem(key) {
          if (storageThrows) throw new Error("storage blocked");
          assert.equal(key, "calocount:theme");
          return stored;
        },
      },
      matchMedia(query) {
        assert.equal(query, "(prefers-color-scheme: light)");
        return { matches: prefersLight };
      },
    },
    document: { documentElement: root },
  });
  return root;
}

test("the inline theme script applies the saved theme before hydration", async () => {
  const { html } = await render("/");
  const script = html.match(/<script id="theme-initializer">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "the page must inline the theme script");

  for (const [options, theme] of [
    [{ stored: "dark", prefersLight: true }, "dark"],
    [{ stored: "light", prefersLight: false }, "light"],
    [{ stored: "system", prefersLight: true }, "light"],
    [{ stored: null, prefersLight: false }, "dark"],
    [{ stored: "unexpected", prefersLight: true }, "light"],
  ]) {
    const root = runThemeInitializer(script, options);
    assert.equal(root.dataset.theme, theme, JSON.stringify(options));
    assert.equal(root.style.colorScheme, theme, JSON.stringify(options));
  }

  // Blocked storage must not throw or set a theme; the stylesheet's System default applies.
  const blocked = runThemeInitializer(script, { stored: null, prefersLight: true, storageThrows: true });
  assert.deepEqual(blocked.dataset, {});
});
