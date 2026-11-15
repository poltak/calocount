/**
 * The two pages of the OAuth sign-in that the server draws itself: the
 * consent page and the page for a request that cannot go back to its app. The
 * owner sees them only in the pop-up that an app opens, so they need no part of
 * the React page, and their small style sheet is inline.
 */

const STYLE = `
:root{color-scheme:dark light;--bg:#0f131b;--panel:#161c26;--line:#283241;--fg:#f2f5f7;--muted:#b9c3ce;--accent:#f5a25d;--accent-fg:#24190f}
@media (prefers-color-scheme:light){:root{--bg:#f6f4f0;--panel:#fff;--line:#ddd6cc;--fg:#1d2430;--muted:#5b6674;--accent:#d97a2b;--accent-fg:#fff}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{box-sizing:border-box;width:min(28rem,100%);padding:1rem}
section{background:var(--panel);border:1px solid var(--line);border-radius:1rem;padding:1.5rem}
h1{margin:0 0 .75rem;font-size:1.35rem}
p{margin:.5rem 0;color:var(--muted)}
.notice{border-left:3px solid var(--accent);padding-left:.75rem}
form{display:flex;gap:.75rem;margin-top:1.25rem}
button{flex:1;padding:.7rem 1rem;border-radius:.6rem;border:1px solid var(--line);background:transparent;color:var(--fg);font:inherit;cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg);font-weight:600}
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The page must not show in a frame of another site, where a click could be
 * hijacked. The `same-origin` policy is also in a meta tag: the server sets
 * `no-referrer` on every response, and with it a browser sends `Origin: null`
 * with the consent form, which the same-origin check of the answer refuses.
 */
function page({
  title,
  body,
  status,
}: {
  title: string;
  body: string;
  status: number;
}): Response {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="referrer" content="same-origin"/><meta name="robots" content="noindex"/><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main><section>${body}</section></main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, must-revalidate",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      },
    },
  );
}

/** Ask the owner to allow an app. The form posts the checked request back. */
export function renderConsentPage({
  clientName,
  redirectHost,
  fields,
}: {
  clientName: string;
  redirectHost: string;
  fields: Record<string, string>;
}): Response {
  const name = escapeHtml(clientName);
  const hidden = Object.entries(fields)
    .map(
      ([field, value]) =>
        `<input type="hidden" name="${escapeHtml(field)}" value="${escapeHtml(value)}"/>`,
    )
    .join("");
  return page({
    title: "Connect an app — Calocount",
    status: 200,
    body: `<h1>Connect ${name} to Calocount?</h1><p>${name} will be able to read your entries, nutrition and weights, and to add and change entries.</p><p class="notice">After you allow it, Calocount sends you to <strong>${escapeHtml(redirectHost)}</strong>. Allow only an app that you started to connect yourself.</p><form method="post" action="/oauth/authorize">${hidden}<button class="primary" type="submit" name="decision" value="allow">Allow</button><button type="submit" name="decision" value="deny">Deny</button></form>`,
  });
}

/** An OAuth request that cannot go back to its app, for example because its return address is not registered. */
export function renderConnectionErrorPage({
  status,
  message,
}: {
  status: number;
  message: string;
}): Response {
  return page({
    title: "Connection error — Calocount",
    status,
    body: `<h1>This connection cannot continue</h1><p>${escapeHtml(message)}</p><p class="notice">Start the connection again from the app.</p>`,
  });
}
