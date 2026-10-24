# Sign-in

Each Calocount instance has one owner. Two sign-in methods exist, and
`CALOCOUNT_AUTH_MODE` selects one:

| Mode | Owner dashboard and owner API | MCP endpoint (`/mcp`) |
| --- | --- | --- |
| `passkey` | A passkey, then a session cookie | OAuth 2.1. The owner allows each app with a passkey session. |
| `access` | A Cloudflare Access JWT | Cloudflare Access Managed OAuth |

When `CALOCOUNT_AUTH_MODE` is not set, an instance that has
`CALOCOUNT_ACCESS_TEAM_DOMAIN` and `CALOCOUNT_ACCESS_AUDIENCE` uses `access`.
Every other instance uses `passkey`. An unknown value fails closed with `503`
and the code `auth_mode_invalid`. `CALOCOUNT_ALLOW_LOCAL=true` turns sign-in
off. Use it only for local development.

## Passkey mode

Passkey mode needs no account outside Cloudflare. The owner signs in with a
face, a fingerprint or a screen lock.

### Setup code

`CALOCOUNT_SETUP_CODE` is a secret with at least 12 characters. A person
without a session needs it to save a passkey: the first passkey of an
instance, and a new passkey after the owner loses all devices.

- One network (one IP address) can try 10 wrong codes in 15 minutes, and all
  networks together can try 50. Each attempt counts before the check, so
  parallel requests cannot pass a limit. A refused attempt and a correct code
  do not count, so one network cannot lock the owner out. Passkey sign-in has no
  limit, because nobody can guess a passkey.
- A missing or short setup code stops the setup with `503`. The sign-in page
  tells the owner how to set it.
- The owner can change the secret at any time. Saved passkeys continue to work.

### Passkeys

- The Worker uses WebAuthn with resident keys and user verification. The
  relying party ID is the host name of the request. Sign-in asks the browser
  for any passkey of the site, so the server does not show credential IDs to
  anonymous visitors.
- A passkey works only on the host name where the owner saved it. After a move
  to another host name, use the setup code there to save a new passkey.
- The database keeps the public key of each passkey. No private key leaves
  the device.
- **Settings > Sign-in** lists the passkeys. The owner can add a passkey on
  the current device and remove a passkey. The last passkey cannot be removed,
  so the owner keeps a way in. Removing a passkey ends the sessions that it
  signed in.

### Sessions

- The cookie is `__Host-calocount_session` on HTTPS and `calocount_session` on
  `http://localhost`. It is `HttpOnly` and `SameSite=Lax`, `Secure` on HTTPS,
  and has a `Max-Age` of 400 days. The database keeps only the SHA-256 of the
  cookie value.
- A session ends after 180 days without use. Each use moves the end, and each
  visit to the owner dashboard renews the cookie. An owner who uses the app
  does not sign in again.
- A request that changes data with the cookie (`POST`, `PUT`, `PATCH`,
  `DELETE`) must send the `Origin` of the site. Other requests get `403` with
  the code `invalid_origin`.
- The sign-in, consent and error pages send `X-Frame-Options: DENY`,
  `Content-Security-Policy: frame-ancestors 'none'` and
  `Referrer-Policy: same-origin`. Do not change the referrer policy to
  `no-referrer`: with it, browsers send `Origin: null` with the consent form,
  and the same-origin check refuses the owner's answer.

### Routes

| Path | Who can use it | Purpose |
| --- | --- | --- |
| `/owner` | Anyone | The dashboard with a live session, otherwise the sign-in page |
| `GET /api/auth/status` | Anyone | The mode, and whether the browser is signed in and the instance has a passkey |
| `POST /api/auth/register/options` | A session, or anyone with the setup code | Start to save a passkey |
| `POST /api/auth/register/verify` | The holder of a registration challenge | Save the passkey, and sign in without a session |
| `POST /api/auth/login/options` and `/verify` | Anyone | Sign in with a passkey |
| `POST /api/auth/logout` | Anyone | End the session of this browser |
| `GET /api/auth/passkeys`, `DELETE /api/auth/passkeys/:id` | A session | List and remove passkeys |
| `GET /api/auth/connections`, `DELETE /api/auth/connections/:id` | A session | List and disconnect OAuth apps |

Every other `/api/*` route needs a session. `tests/worker-routes.test.mjs`
checks this for each route file.

### OAuth for the MCP endpoint

ChatGPT and other MCP clients use OAuth 2.1 to call `/mcp`:

1. `/mcp` answers a request without a valid token with `401` and
   `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource/mcp"`.
2. `/.well-known/oauth-protected-resource` (also with `/mcp` at the end) names
   the resource `https://<host>/mcp` and the authorization server
   `https://<host>` (RFC 9728).
3. `/.well-known/oauth-authorization-server` lists the endpoints (RFC 8414).
   It advertises PKCE `S256` only and the `iss` response parameter (RFC 9207).
4. The client registers at `POST /oauth/register` (RFC 7591). Redirect URIs
   must use HTTPS, or HTTP on `localhost`. One network can register 10 clients
   in an hour, and all networks together 200.
5. `GET /oauth/authorize` shows the sign-in page without a session. With a
   session, it shows the consent page with the name of the app and the host
   that receives the code. Allow and Deny post the form back to the same path.
   A request error shows on the page and never redirects. Anyone can register a
   client with any HTTPS redirect URI, so an error redirect would be an open
   redirect (RFC 9700, section 4.11.2).
6. `POST /oauth/token` exchanges the code with the PKCE verifier, and
   refreshes tokens.

Access tokens last one hour. Refresh tokens last 180 days, and each refresh
moves the end. A public client gets a new refresh token at each refresh, and
the old one works for two more minutes, so a client that lost the answer can
retry. One app has one connection: a new approval replaces the earlier one.
**Settings > Sign-in > Connected apps** disconnects an app, and its tokens stop
working at once. The database keeps only the SHA-256 of each code and token.

The hourly cron trigger removes expired sessions, challenges, codes and
tokens, connections without a refresh token, and registered apps that the
owner did not allow within a day. An app that the owner allowed once stays
registered, because ChatGPT uses its client ID again after a disconnect.

### Try passkeys locally

In `.dev.vars`, set `CALOCOUNT_ALLOW_LOCAL=false` and a
`CALOCOUNT_SETUP_CODE`, apply the migrations with `pnpm run db:migrate:local`,
and run `pnpm run dev`. Open `http://localhost:3000/owner`. Browsers allow
passkeys on `localhost`, but not on `127.0.0.1`.

## Access mode

Access mode keeps the earlier behavior. The Access layout is in
[read-only-sharing.md](read-only-sharing.md). The passkey routes and the OAuth
routes return `404`, and `/api/auth/status` returns `{ "mode": "access" }`.

## Move an Access instance to passkeys

These steps keep the data. They change only the sign-in.

1. In the Cloudflare dashboard, open the Worker, then **Settings > Variables
   and Secrets**. Add a secret `CALOCOUNT_SETUP_CODE` with a long phrase of at
   least 12 characters. Add a variable of the type **Text** with the name
   `CALOCOUNT_AUTH_MODE` and the value `passkey`. `keep_vars` keeps both after
   later deploys.
2. Deploy this version of Calocount, for example with a push to `main`.
3. Open `/owner`. Access asks you to sign in one last time. Then Calocount
   shows **Set up Calocount**. Type the setup code and save a passkey.
4. In Cloudflare Zero Trust, open **Access > Applications**. Delete the
   Calocount applications: the owner application for `/owner`, `/owner/*` and
   `/api/*`, the bypass application for `/api/public/summary`, and the
   application for `/mcp`.
5. Open `/owner` in a private window. Calocount asks for the passkey, and
   Access does not show.
6. Connect ChatGPT again. Follow
   [the MCP setup guide](plugin/README.md#passkey-mode-oauth). The old ChatGPT
   connection used Access tokens, which passkey mode does not accept.
7. Optional: delete the variables `CALOCOUNT_ACCESS_TEAM_DOMAIN`,
   `CALOCOUNT_ACCESS_AUDIENCE`, `CALOCOUNT_MCP_ACCESS_AUDIENCE` and
   `CALOCOUNT_ALLOWED_EMAIL_SHA256`. Passkey mode does not read them.

To go back, set `CALOCOUNT_AUTH_MODE` to `access` and create the Access
applications again.
