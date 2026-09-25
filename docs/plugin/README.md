# Calocount private meal-tracking plugin

This directory contains the local plugin package at [`plugins/calocount-meal-tracker`](../../plugins/calocount-meal-tracker/). It has one skill: `meal-tracking`. The skill tells ChatGPT when and how to call Calocount's `add_meals` MCP tool.

The tool contract is one argument object with a `meals` array and optional top-level `photos` and `photo_meal_indices` arrays. It accepts 1 to 20 meals in a call. Each meal follows the current `/api/add-meal` meal fields. Each `photos` entry is a ChatGPT file value. The entry at `photos[i]` belongs to the meal at `meals[photo_meal_indices[i]]`; indices start at zero. Both arrays must have the same length, with no more than one photo per meal and 20 photos per call. The tool returns the meal batch result, `daily_totals`, and whether each meal has an image.

OpenAI requires the MCP tool metadata to declare `photos` as a file parameter in `_meta["openai/fileParams"]`. ChatGPT provides the file value with `download_url` and `file_id`, and may include `mime_type` and `file_name`. See the [OpenAI file APIs reference](https://developers.openai.com/plugins/reference#file-apis).

The root `plugin.json` uses the portable Agent Plugins format. The skill is under `skills/meal-tracking/SKILL.md`. The OpenAI app mapping in `.app.json` uses the owner's registered **App Id** (`asdk_app_...`), not the version-specific `asdk_app_v_...` ID. The skill declares the Calocount MCP dependency in `agents/openai.yaml`. OpenAI's plugin docs describe this split: the skill gives workflow instructions, while the MCP server provides live data and controlled actions ([Build skills](https://developers.openai.com/plugins/build/skills), [Package your plugin](https://developers.openai.com/plugins/build/plugins)).

## Required server and Access setup

ChatGPT must reach the MCP server through a public HTTPS endpoint or Secure MCP Tunnel. A public endpoint uses Streamable HTTP, usually at `/mcp`. OpenAI explains this in [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

Before you deploy the Worker, verify that the Calocount Worker serves `POST /mcp`, exposes only `add_meals`, and routes `/mcp` to the Worker first with Wrangler `run_worker_first`.

The Worker must check each ChatGPT file `download_url` against its configured host allowlist before it fetches the image. Test with a real ChatGPT chat upload and record the actual download host. If that host differs from the allowlist, update the allowlist and redeploy. Do not allow arbitrary download hosts. Confirm that the Worker stores the image with the meal selected by `photo_meal_indices`, and test that one photo cannot attach to more than one meal.

Deployment note: the Access paths in this repository cover `/owner` and `/api/*`; they do not cover `/mcp`. Before deployment, recheck the live Cloudflare Access configuration. Add and test an exact Access application path for the Calocount host and `/mcp`. Give it the existing owner Allow policy. Turn on Managed OAuth for this application.

Each Access application has its own JWT audience. Set `CALOCOUNT_MCP_ACCESS_AUDIENCE` in the Calocount Worker environment to the audience tag for the new `/mcp` application. Keep `CALOCOUNT_ACCESS_AUDIENCE` set to the audience tag for the existing `/api/*` application. Do not reuse the `/api/*` audience for `/mcp`. Confirm that the Worker validates the signed Access JWT and checks the expected owner identity before it writes a meal. Test that a missing or wrong `CALOCOUNT_MCP_ACCESS_AUDIENCE` rejects the request and stores no meal. Cloudflare documents path rules, Managed OAuth, and audience and JWT validation ([Application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/), [Application token audience](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/), [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)).

Do not use the old Custom GPT bearer secret for this connection. ChatGPT signs in through Access Managed OAuth. The server must still validate the Access JWT and allow only the configured owner.

## Test in standard Chat

Use the owner's Personal Plus or Pro account in ChatGPT web. OpenAI's current [developer mode guide](https://developers.openai.com/api/docs/guides/developer-mode) says Plus and Pro can use MCP write tools in web developer mode. ChatGPT can ask for confirmation before a write. Confirm each test write in ChatGPT when it asks.

1. Deploy the Worker and confirm the HTTPS `/mcp` endpoint works. Finish the Cloudflare Access setup above first.
2. The owner must enable Developer mode and create the private app in ChatGPT. Enter the deployed endpoint ending in `/mcp`, select OAuth, and sign in with the account that matches the Calocount Access policy. Confirm that ChatGPT lists exactly one tool: `add_meals`.
3. Start a new **standard Chat**. Use the `+` control in the composer, open **Developer mode**, and select the Calocount app. OpenAI also documents the app picker under `+` > **More** for supported chats ([Connect and test your plugin](https://developers.openai.com/plugins/build/app-quickstart)). Test the app in standard Chat. Do not switch to Work for this acceptance test.
4. Test an estimate-only request. Confirm that ChatGPT gives an estimate and does not call `add_meals`. A photo without a clear request to log also must not call the tool.
5. Clearly ask ChatGPT to log a meal. Confirm that it shows the estimate before the write, calls `add_meals`, and reports the returned result. Check the meal in Calocount. Retry with the same UUID and confirm that the server reports an existing meal without adding a duplicate.
6. Upload a meal photo and clearly ask ChatGPT to log the meal. Confirm that it sends only the file values supplied by ChatGPT and maps the photo to the correct meal. ChatGPT can say that the photo was stored only when the result has `has_image: true`. If ChatGPT supplies no file value, the meal can be logged without the photo.

## Install and test the skill

The package now links the registered Calocount app and the `meal-tracking` skill. The App Id is in `.app.json`; the Version Id is not part of the package. Keep credentials out of the package. Do not publish it to the public directory. OpenAI's [plugin validation rules](https://developers.openai.com/plugins/deploy/submission-errors) accept registered app IDs that start with `asdk_app_`.

The repository includes a private marketplace entry at [`.agents/plugins/marketplace.json`](../../.agents/plugins/marketplace.json). Restart the ChatGPT desktop app and open the Calocount repository. In its Plugins Directory, choose **Calocount Local**, inspect **calocount-meal-tracker**, and install it. This marketplace is local to the repository. OpenAI documents this [repo marketplace format](https://developers.openai.com/plugins/build/plugins).

After installation, start a new **standard Chat** and select Calocount from `+` > **More**. OpenAI says installed plugins, including their skills and MCP tools, can run in Chat and Work on supported clients ([Plugins in ChatGPT](https://learn.chatgpt.com/docs/plugins)). Confirm that the `meal-tracking` skill guides the estimate, intent, photo, UUID, retry, and truthful-result behavior. The skill asks for a programmatically generated UUID when a code tool is available. It cannot guarantee that ChatGPT ran code in a chat without that tool. The MCP server still validates UUID syntax and prevents duplicate rows.

The [local marketplace instructions](https://developers.openai.com/plugins/build/plugins) describe a local package picker in Work or Codex desktop. That is one authoring path. It does not make Work a requirement for an installed plugin in ChatGPT. Use the standard Chat plugin picker to test the installed plugin.
