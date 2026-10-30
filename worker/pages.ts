/** The HTML documents of the app. Each one is a string; the browser code takes over the dashboard pages. */
import assets from "virtual:client-assets";

import { THEME_STORAGE_KEY } from "../app/theme";

const TITLE = "Calocount — simple calorie tracking";
const DESCRIPTION = "Food and drink entries. Clear calorie and protein numbers.";

// Runs before the first paint so a saved theme does not flash the other one.
const themeInitializer = `(() => {
  try {
    const stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    const preference = stored === "light" || stored === "dark" ? stored : "system";
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    const theme = preference === "system" ? (prefersLight ? "light" : "dark") : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    // Keep the default System theme when browser storage or media queries are unavailable.
  }
})();`;

const serviceWorkerRegistration = `(() => {
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!("serviceWorker" in navigator) || (!window.isSecureContext && !isLocalhost)) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
})();`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** The origin the visitor used, for the absolute image links that link previews need. */
function requestOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return new URL(request.url).origin;
  }
}

function document({ request, title = TITLE, description = DESCRIPTION, body, scripts = true }: {
  request: Request;
  title?: string;
  description?: string;
  body: string;
  /** False for a page that needs no browser code. */
  scripts?: boolean;
}): string {
  const image = escapeHtml(`${requestOrigin(request)}/og.png`);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}"/>
<meta name="application-name" content="Calocount"/>
<meta name="theme-color" content="#f5f7f6" media="(prefers-color-scheme: light)"/>
<meta name="theme-color" content="#0f131b" media="(prefers-color-scheme: dark)"/>
<meta name="color-scheme" content="light dark"/>
<script id="theme-initializer">${themeInitializer}</script>
${assets.styles.map((href) => `<link rel="stylesheet" href="${href}"/>`).join("")}
${scripts ? assets.preloads.map((href) => `<link rel="modulepreload" href="${href}"/>`).join("") : ""}
<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"/>
<link rel="shortcut icon" href="/favicon.ico"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16"/>
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32"/>
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192"/>
<link rel="icon" href="/icon-512.png" type="image/png" sizes="512x512"/>
<link rel="apple-touch-icon" href="/apple-touch-icon.png" type="image/png" sizes="180x180"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-title" content="Calocount"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<meta property="og:title" content="${escapeHtml(TITLE)}"/>
<meta property="og:description" content="${escapeHtml(DESCRIPTION)}"/>
<meta property="og:type" content="website"/>
<meta property="og:image" content="${image}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escapeHtml(TITLE)}"/>
<meta name="twitter:description" content="${escapeHtml(DESCRIPTION)}"/>
<meta name="twitter:image" content="${image}"/>
</head><body>${body}<script>${serviceWorkerRegistration}</script>${scripts ? assets.scripts.map((src) => `<script type="module" src="${src}"></script>`).join("") : ""}</body></html>`;
}

/**
 * The dashboard before its data arrives. The browser code builds the same
 * markup when it starts, so the page does not change until the data loads.
 */
function dashboardShell({ publicView }: { publicView: boolean }): string {
  const loading = publicView ? "Loading the public dashboard…" : "Loading your saved log…";
  return `<main class="app-shell" data-view="${publicView ? "public" : "owner"}"><header class="topbar"><a class="brand" href="#today" aria-label="${publicView ? "Calocount public view" : "Calocount home"}"><span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span><span>calocount</span></a><div class="topbar-actions"><span class="sync-status"><span class="status-dot" aria-hidden="true"></span> ${publicView ? "Public read-only" : "Loading"}</span>${publicView ? `<a class="secondary-button owner-link" href="/owner">Open owner view</a>` : ""}<span class="avatar" aria-label="${publicView ? "Public read-only view" : "Account"}"><span aria-hidden="true">${publicView ? "↗" : "M"}</span></span></div></header><div class="data-banner loading" role="status"><span aria-hidden="true">…</span>${loading}</div><section class="dashboard-state" aria-live="polite"><span class="dashboard-state-mark" aria-hidden="true">…</span><h1>${publicView ? "Loading public dashboard" : "Loading your saved log"}</h1><p>${loading}</p></section><footer class="app-footer"><span>${publicView ? "Public read-only view" : "Private by default"}</span><span class="footer-separator" aria-hidden="true">·</span><span>Calocount dashboard</span></footer></main>`;
}

const privacyBody = `<main class="app-shell">
<article class="settings-panel" aria-labelledby="privacy-policy-title">
<header class="date-heading">
<p class="eyebrow">Calocount</p>
<h1 id="privacy-policy-title">Privacy Policy</h1>
<p>Effective date: <time datetime="2026-08-30">August 30, 2026</time></p>
</header>
<section aria-labelledby="about-service">
<h2 id="about-service">About this service</h2>
<p>Calocount is a personal, single-user food and drink logging service operated for private use.</p>
</section>
<section aria-labelledby="information-processed">
<h2 id="information-processed">Information we process</h2>
<p>We process the following information when you use the service:</p>
<ul>
<li>Entry name, calories, protein, carbohydrates, fat, and consumed time.</li>
<li>An optional entry photo that you upload with an entry.</li>
</ul>
</section>
<section aria-labelledby="how-information-is-used">
<h2 id="how-information-is-used">How we use information</h2>
<p>We use this information only to provide, maintain, and secure the entry logging service. We do not sell data or share it for advertising.</p>
</section>
<section aria-labelledby="storage">
<h2 id="storage">Storage and temporary file links</h2>
<p>Entry records are stored in Cloudflare D1. Optional entry photos are stored in Cloudflare R2. Temporary OpenAI file links are downloaded immediately for processing and are not retained by this service.</p>
</section>
<section aria-labelledby="retention">
<h2 id="retention">Retention</h2>
<p>We retain data until you delete it or it is no longer needed for the service.</p>
</section>
<section aria-labelledby="security">
<h2 id="security">Security</h2>
<p>We use HTTPS and access controls to protect data, but no system can be guaranteed completely secure.</p>
</section>
<section aria-labelledby="your-choices">
<h2 id="your-choices">Your choices</h2>
<p>You can request access to, correction of, or deletion of your data through the service operator.</p>
</section>
</article>
</main>`;

const notFoundBody = `<main class="app-shell"><section class="dashboard-state"><span class="dashboard-state-mark" aria-hidden="true">!</span><h1>Page not found</h1><p>This page does not exist.</p><a class="primary-button" href="/">Open Calocount</a></section></main>`;

function html(markup: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(markup, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, must-revalidate", ...headers },
  });
}

/**
 * Sign-in and consent pages must not show inside a frame of another site,
 * where a click could be hijacked. `same-origin` keeps the address of the page
 * from other sites. Do not use `no-referrer`: with it, the browser sends
 * `Origin: null` with the consent form, and the same-origin check refuses it.
 */
const NO_FRAME_HEADERS = {
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "referrer-policy": "same-origin",
};

const brandMark = `<span class="brand-mark auth-brand" aria-hidden="true"><span></span><span></span><span></span></span>`;

/**
 * The sign-in page before its script runs. The script asks the server whether
 * this instance has a passkey, then shows the sign-in or the setup form.
 */
function signInShell({ returnTo, notice }: { returnTo: string; notice?: string }): string {
  const noticeAttribute = notice ? ` data-notice="${escapeHtml(notice)}"` : "";
  return `<main class="app-shell auth-shell" data-view="sign-in" data-return-to="${escapeHtml(returnTo)}"${noticeAttribute}><section class="auth-panel" aria-live="polite">${brandMark}<h1>Sign in to Calocount</h1>${notice ? `<p class="auth-notice">${escapeHtml(notice)}</p>` : ""}<p class="auth-status">Checking sign-in…</p></section></main>`;
}

/** The sign-in page. After sign-in, the browser goes to `returnTo`, a path on this site. */
export function renderSignInPage(request: Request, { returnTo, notice, headers = {} }: {
  returnTo: string;
  notice?: string;
  headers?: Record<string, string>;
}): Response {
  return html(document({ request, title: "Sign in — Calocount", body: signInShell({ returnTo, notice }) }), 200, { ...NO_FRAME_HEADERS, ...headers });
}

/** The owner dashboard page. A passkey session can renew its cookie with `headers`. */
export function renderOwnerPage(request: Request, headers: Record<string, string> = {}): Response {
  return html(document({ request, body: dashboardShell({ publicView: false }) }), 200, headers);
}

/** Ask the owner to allow an OAuth client. The form posts the checked request back. */
export function renderConsentPage(request: Request, { clientName, redirectHost, fields }: {
  clientName: string;
  redirectHost: string;
  fields: Record<string, string>;
}): Response {
  const name = escapeHtml(clientName);
  const hidden = Object.entries(fields)
    .map(([field, value]) => `<input type="hidden" name="${escapeHtml(field)}" value="${escapeHtml(value)}"/>`)
    .join("");
  const body = `<main class="app-shell auth-shell"><section class="auth-panel">${brandMark}<h1>Connect ${name} to Calocount?</h1><p>${name} will be able to read your entries, nutrition and weights, and to add and change entries.</p><p class="auth-notice">After you allow it, Calocount sends you to <strong>${escapeHtml(redirectHost)}</strong>. Allow only an app that you started to connect yourself.</p><form class="auth-actions" method="post" action="/oauth/authorize">${hidden}<button class="primary-button" type="submit" name="decision" value="allow">Allow</button><button class="secondary-button" type="submit" name="decision" value="deny">Deny</button></form></section></main>`;
  return html(document({ request, title: "Connect an app — Calocount", body, scripts: false }), 200, NO_FRAME_HEADERS);
}

/** An OAuth request that cannot go back to its app, for example because its return address is not registered. */
export function renderOAuthErrorPage(request: Request, { status, message }: { status: number; message: string }): Response {
  const body = `<main class="app-shell auth-shell"><section class="auth-panel">${brandMark}<h1>This connection cannot continue</h1><p>${escapeHtml(message)}</p><p class="auth-notice">Start the connection again from the app.</p></section></main>`;
  return html(document({ request, title: "Connection error — Calocount", body, scripts: false }), status, NO_FRAME_HEADERS);
}

/** The owner dashboard paths: the owner's log and the partner's log. */
export function isOwnerPagePath(pathname: string): boolean {
  return pathname === "/owner" || pathname === "/owner/partner";
}

/** Answer a request for a page. Returns null when no page has the path. */
export function renderPage(request: Request, pathname: string): Response | null {
  if (pathname === "/") return html(document({ request, body: dashboardShell({ publicView: true }) }));
  if (isOwnerPagePath(pathname)) return renderOwnerPage(request);
  if (pathname === "/privacy") {
    return html(document({
      request,
      title: "Privacy Policy — Calocount",
      description: "Privacy policy for the Calocount personal entry logging service.",
      body: privacyBody,
      scripts: false,
    }));
  }
  return null;
}

export function renderNotFound(request: Request): Response {
  return html(document({ request, title: "Page not found — Calocount", body: notFoundBody, scripts: false }), 404);
}
