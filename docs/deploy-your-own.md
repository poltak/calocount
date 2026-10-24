# Deploy your own Calocount

Each Calocount instance has one owner, one Worker, one D1 database and one R2
bucket. Two instances do not share data. The owner signs in with a passkey: a
face, a fingerprint or a screen lock. The owner needs no other account.

You need:

- a Cloudflare account. The Workers Free plan is sufficient;
- a GitHub or GitLab account; and
- approximately 10 minutes.

## 1. Deploy the Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/poltak/calocount)

1. Select the button above.
2. Sign in to Cloudflare, and connect your GitHub or GitLab account.
3. Keep the default names, or type new names. Cloudflare makes a copy of this
   repository in your account, and it creates a new D1 database and a new R2
   bucket.
4. For `CALOCOUNT_SETUP_CODE`, type a long phrase that only you know, with at
   least 12 characters. Write it down and keep it safe. You need it for the
   first passkey, and again if you lose all your devices.
5. Keep `CALOCOUNT_OWNER_KEY` as `default` and `CALOCOUNT_ALLOW_LOCAL` as
   `false`.
6. Select **Deploy**. The build applies the database migrations, then it
   deploys the Worker.

The Worker gets an address such as
`https://calocount-app.<your-subdomain>.workers.dev`.

## 2. Save the first passkey

1. Open the Worker address on the phone or computer of the owner.
2. Calocount shows **Set up Calocount**. Type the setup code, and select
   **Create passkey**.
3. Confirm with the face, the fingerprint or the screen lock. The dashboard
   opens.

On a phone, add the page to the home screen. The installed app opens the
owner dashboard. Apple and Google copy the passkey to the other devices of the
same account, so those devices can sign in too.

If you set up Calocount for another person, do step 2 on that person's phone.
Then the passkey belongs to their account.

## More devices and lost devices

- On a device that is signed in, open **Settings > Sign-in** and select **Add
  a passkey on this device**.
- On a device that is not signed in, select **Lost your passkey? Use your
  setup code** on the sign-in page.
- After you lose a device, remove its passkey in **Settings > Sign-in**. The
  sessions that it signed in end.

## The public dashboard

A new instance is private. To show a read-only dashboard to anyone who opens
the address, turn on **Public dashboard** in the settings. It needs no other
setup.

## Optional: ChatGPT meal logging

ChatGPT can log and read meals through the MCP endpoint at `/mcp`. In ChatGPT,
add a developer-mode connection with the address
`https://<your-worker-address>/mcp` and OAuth sign-in. Calocount asks you to
allow ChatGPT. The [MCP setup guide](plugin/README.md#passkey-mode-oauth) has
the steps.

## Updates

The copy in your account is not a GitHub fork, and it does not get the changes
of this repository. To update, merge the changes of
`https://github.com/poltak/calocount` into your copy. Each push to your copy
deploys again with Workers Builds, and each deploy applies the new database
migrations.

## Deploy without the button

1. Clone the repository, and run `pnpm install`.
2. Create the database with `pnpm exec wrangler d1 create <name>`. Put its name
   and ID in the `d1_databases` entry of `wrangler.jsonc`.
3. Create the bucket with `pnpm exec wrangler r2 bucket create <name>`. Put its
   name in the `r2_buckets` entry.
4. Change `name` in `wrangler.jsonc` to the name of your Worker.
5. Run `pnpm run deploy`. It builds the app, applies the migrations, and
   deploys the Worker.
6. Set the setup code with `pnpm exec wrangler secret put CALOCOUNT_SETUP_CODE`.
7. Do step 2 above.

## Cloudflare Access instead of passkeys

An instance can use Cloudflare Access instead. [sign-in.md](sign-in.md)
describes both modes, and the steps that move an Access instance to passkeys.
