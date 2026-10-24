# Deploy your own Calocount

Each Calocount instance has one owner, one Worker, one D1 database and one R2
bucket. Two instances do not share data.

You need:

- a Cloudflare account. The Workers Free plan is sufficient;
- a GitHub or GitLab account; and
- approximately 15 minutes.

## 1. Deploy the Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/poltak/calocount)

1. Select the button above.
2. Sign in to Cloudflare, and connect your GitHub or GitLab account.
3. Keep the default names, or type new names. Cloudflare makes a copy of this
   repository in your account, and it creates a new D1 database and a new R2
   bucket.
4. For `CALOCOUNT_OWNER_EMAIL`, type the email address that you will sign in
   with.
5. Keep `CALOCOUNT_OWNER_KEY` as `default` and `CALOCOUNT_ALLOW_LOCAL` as
   `false`.
6. Select **Deploy**. The build applies the database migrations, then it
   deploys the Worker.

The Worker gets an address such as
`https://calocount-app.<your-subdomain>.workers.dev`. Until you complete step 3,
the dashboard at that address says that owner sign-in is not configured. This
is correct. The Worker shows no data before you set up sign-in.

## 2. Protect the Worker with Cloudflare Access

1. In the Cloudflare dashboard, open **Workers & Pages**, then your Worker.
2. Open **Access**, and select **Protect this Worker behind Access**.
   Cloudflare describes the current steps in
   [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
3. Make the policy let in only the email address from step 1.
4. Copy the two values that Cloudflare shows: the team domain, for example
   `yourteam.cloudflareaccess.com`, and the application audience (AUD) tag.

## 3. Give the two values to the Worker

1. In your Worker, open **Settings**, then **Variables and Secrets**.
2. Add a variable of the type **Text** with the name
   `CALOCOUNT_ACCESS_TEAM_DOMAIN`. Its value is the team domain.
3. Add a variable of the type **Text** with the name
   `CALOCOUNT_ACCESS_AUDIENCE`. Its value is the AUD tag.
4. Deploy the change.

`wrangler.jsonc` sets `keep_vars` to `true`, so later deploys keep these
variables.

## 4. Open your dashboard

Open the Worker address. Cloudflare Access asks you to sign in, then the owner
dashboard opens. On a phone, add the page to the home screen. The installed app
opens the owner dashboard.

## The public dashboard

A new instance is private. The setting **Public dashboard** in the owner
settings is off. With the Access setup above, Access protects every path of the
Worker, so a public dashboard also needs a different Access setup. The
[read-only sharing guide](read-only-sharing.md) gives the path rules.

## Updates

The copy in your account is not a GitHub fork, and it does not get the changes
of this repository. To update, merge the changes of
`https://github.com/poltak/calocount` into your copy. Each push to your copy
deploys again with Workers Builds, and each deploy applies the new database
migrations.

## Optional: ChatGPT meal logging

The ChatGPT app at `/mcp` needs one more Access application with Managed OAuth
and the variable `CALOCOUNT_MCP_ACCESS_AUDIENCE`. This setup is for advanced
users. Follow the [MCP setup guide](plugin/README.md).

## Deploy without the button

1. Clone the repository, and run `pnpm install`.
2. Create the database with `pnpm exec wrangler d1 create <name>`. Put its name
   and ID in the `d1_databases` entry of `wrangler.jsonc`.
3. Create the bucket with `pnpm exec wrangler r2 bucket create <name>`. Put its
   name in the `r2_buckets` entry.
4. Change `name` in `wrangler.jsonc` to the name of your Worker.
5. Run `pnpm run deploy`. It builds the app, applies the migrations, and
   deploys the Worker.
6. Set the owner email with `pnpm exec wrangler secret put CALOCOUNT_OWNER_EMAIL`.
7. Do steps 2 to 4 above.
