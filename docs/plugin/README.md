# Calocount private meal-tracking plugin

This directory contains the local plugin package at [`plugins/calocount-meal-tracker`](../../plugins/calocount-meal-tracker/). It has one skill: `meal-tracking`. The skill tells ChatGPT when and how to call Calocount's `add_meals` MCP tool.

The tool contract is one argument object with a `meals` array and optional top-level `photos` and `photo_meal_indices` arrays. It accepts 1 to 20 meals in a call. Each meal follows the current `/api/add-meal` meal fields. Each `photos` entry is a ChatGPT file value. The entry at `photos[i]` belongs to the meal at `meals[photo_meal_indices[i]]`; indices start at zero. Both arrays must have the same length, with no more than one photo per meal and 20 photos per call. The tool returns the meal batch result, `daily_totals`, and whether each meal has an image.

OpenAI requires the MCP tool metadata to declare `photos` as a file parameter in `_meta["openai/fileParams"]`. ChatGPT provides the file value with `download_url` and `file_id`, and may include `mime_type` and `file_name`. See the [OpenAI file APIs reference](https://developers.openai.com/plugins/reference#file-apis).

The root `plugin.json` uses the portable Agent Plugins format. The skill is under `skills/meal-tracking/SKILL.md`. The package has no registered ChatGPT app ID yet. Add the OpenAI app mapping only after the owner registers and tests the real MCP endpoint. OpenAI's plugin docs describe this split: the skill gives workflow instructions, while the MCP server provides live data and controlled actions ([Build skills](https://developers.openai.com/plugins/build/skills), [Package your plugin](https://developers.openai.com/plugins/build/plugins)).

## Required server and Access setup

ChatGPT must reach the MCP server through a public HTTPS endpoint or Secure MCP Tunnel. A public endpoint uses Streamable HTTP, usually at `/mcp`. OpenAI explains this in [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

Before you deploy the Worker, verify that the Calocount Worker serves `POST /mcp`, exposes only `add_meals`, and routes `/mcp` to the Worker first with Wrangler `run_worker_first`.

The Worker must check each ChatGPT file `download_url` against its configured host allowlist before it fetches the image. Test with a real ChatGPT chat upload and record the actual download host. If that host differs from the allowlist, update the allowlist and redeploy. Do not allow arbitrary download hosts. Confirm that the Worker stores the image with the meal selected by `photo_meal_indices`, and test that one photo cannot attach to more than one meal.

Deployment note: the Access paths in this repository cover `/owner` and `/api/*`; they do not cover `/mcp`. Before deployment, recheck the live Cloudflare Access configuration. Add and test an exact Access application path for the Calocount host and `/mcp`. Give it the existing owner Allow policy. Turn on Managed OAuth for this application.

Each Access application has its own JWT audience. Set `CALOCOUNT_MCP_ACCESS_AUDIENCE` in the Calocount Worker environment to the audience tag for the new `/mcp` application. Keep `CALOCOUNT_ACCESS_AUDIENCE` set to the audience tag for the existing `/api/*` application. Do not reuse the `/api/*` audience for `/mcp`. Confirm that the Worker validates the signed Access JWT and checks the expected owner identity before it writes a meal. Test that a missing or wrong `CALOCOUNT_MCP_ACCESS_AUDIENCE` rejects the request and stores no meal. Cloudflare documents path rules, Managed OAuth, and audience and JWT validation ([Application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/), [Application token audience](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/), [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)).

Do not use the old Custom GPT bearer secret for this connection. ChatGPT signs in through Access Managed OAuth. The server must still validate the Access JWT and allow only the configured owner.

## Register a private ChatGPT app

1. Confirm that ChatGPT developer mode and MCP write actions are available for the owner's account or workspace. As checked on 2026-09-24, OpenAI's Help Center and developer page differ on plan access. Review the current pages and test the real account in ChatGPT before you rely on write access ([Help Center](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt), [ChatGPT developer page](https://developers.openai.com/chatgpt)).
2. In ChatGPT, enable Developer mode. Open the Apps or Plugins page, create a custom app, and enter the deployed HTTPS endpoint ending in `/mcp`.
3. Select OAuth when ChatGPT asks for authentication. Sign in with the owner account that matches the Calocount Allow policy. Scan the tools. Confirm that ChatGPT finds exactly one tool named `add_meals`, with a required `meals` array of 1 to 20 entries and optional `photos` and `photo_meal_indices` arrays.
4. Complete a safe write test in the intended test environment. Confirm that the tool call creates a meal once and returns the batch result and daily totals. Confirm that the same UUID can safely retry without creating a duplicate.
5. In a ChatGPT chat, upload a meal photo and clearly ask to log the meal. Confirm that ChatGPT sends the file value to `photos`, maps it to the correct meal, and reports image storage only when the result has `has_image: true`. Test multiple meals with one photo per meal. Confirm that estimate-only requests and photos without a clear log request do not call the tool.
6. After ChatGPT creates the app, copy its real technical ID from the browser URL. It starts with `plugin_asdk_app`. Do not guess or add an example ID to this repository.

OpenAI may ask for confirmation before a write action. Follow the prompt during setup and testing. Developer mode and MCP app availability can change, so use the live ChatGPT UI as the final check.

## Wire the app ID to this package

After the endpoint and write test work, use `$plugin-creator` in Codex to wire the registered app to this existing package. Give it the actual ID from ChatGPT and this package path: `plugins/calocount-meal-tracker`. Ask it to keep the portable root `plugin.json` and the existing `meal-tracking` skill, create the registered-app mapping, and set `extensions.com.openai.apps` in the root manifest to `./.app.json`. Do not ask it to publish a public plugin.

Review the result before installation:

- `.app.json` must contain the actual ID that ChatGPT returned.
- `plugin.json` must point to `./.app.json` through `extensions.com.openai.apps`.
- `skills/meal-tracking/SKILL.md` must remain in the package.
- The package must not contain API keys, bearer tokens, or other credentials.

Then add this package to a personal or repo-local plugin marketplace and install it from the Plugins Directory in the ChatGPT desktop app. Keep that marketplace private. Open a new chat and test estimate-only requests, clear log requests, and a retry with the same UUID. OpenAI documents local marketplaces as authoring and testing sources separate from public plugin publication ([Package your plugin](https://developers.openai.com/plugins/build/plugins)).
