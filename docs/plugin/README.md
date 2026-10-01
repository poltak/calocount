# Calocount private MCP app

The owner's standard Chat uses the existing Calocount MCP connection in ChatGPT developer mode. After deployment and refresh, it exposes four tools: `add_meals`, `update_meal`, `get_nutrition_summary`, and `get_nutrition_history`. The repository also contains a [meal-tracking skill draft](../../plugins/calocount-meal-tracker/skills/meal-tracking/SKILL.md). The owner has not installed this draft in standard Chat, and it does not control the existing connection.

The tool contract is one argument object with a `meals` array and optional top-level `photos` and `photo_meal_indices` arrays. It accepts 1 to 20 meals in a call. Each meal follows the current `/api/add-meal` meal fields. Each `photos` entry is a ChatGPT file value. The entry at `photos[i]` belongs to the meal at `meals[photo_meal_indices[i]]`; indices start at zero. Both arrays must have the same length, with no more than one photo per meal and 20 photos per call. The tool returns the meal batch result, `daily_totals`, and whether each meal has an image.

## Edit a saved meal

`update_meal` takes one argument object with an existing meal `request_id` and a nonempty `patch`. Use `get_nutrition_history` to find the meal, then copy its `request_id` exactly. Do not create a new UUID for an update. For example, replace the placeholder with the ID from history:

```json
{
  "request_id": "<existing request_id from history>",
  "patch": { "name": "Chicken rice, corrected" }
}
```

The patch can change `name`, `eaten_at`, `kcal`, `protein`, `carbs`, `fat`, or nutrient values. Send only the fields to change. Omitted meal values, photos, and the original `request_id` stay unchanged. Item patches keep the full item list and preserve other items. Meal macro changes can adjust stored item macros so their sum matches the new meal total. For a correction to a specific food item, use an item patch with its existing `id`. Do not combine meal macros and item macros in one patch. A meal-level nutrient patch is supported only for a meal with one item; use item patches for a meal with more than one item. The tool returns the updated meal and its `request_id`.

For a nutrient correction to one food item, copy both IDs from history:

```json
{
  "request_id": "<existing request_id from history>",
  "patch": {
    "items": [
      { "id": "<existing item id from history>", "nutrients": { "magnesiumMg": 25 } }
    ]
  }
}
```

Do not change the same nutrient at both meal and item level in one patch. An `eaten_at` correction needs a real ISO-8601 date and time with a timezone, such as `2026-09-24T13:30:00+07:00`.

The ID must identify a completed meal in the signed-in account. The tool accepts the original UUID, including IDs from older meal integrations. If history returns `request_id: null`, this tool cannot edit that meal. A missing or wrong ID does not create a meal. Each accepted edit records a revision. If `add_meals` is repeated after an edit with the original ID, it returns the edited meal without making a duplicate or restoring old values.

OpenAI requires the MCP tool metadata to declare `photos` as a file parameter in `_meta["openai/fileParams"]`. ChatGPT provides the file value with `download_url` and `file_id`, and may include `mime_type` and `file_name`. See the [OpenAI file APIs reference](https://developers.openai.com/plugins/reference#file-apis).

The MCP server sends short workflow instructions during initialization. Its `add_meals` tool description and `request_id` field description ask ChatGPT to generate a UUID v4 with a code tool when available and reuse it only for an exact retry. The `update_meal` tool uses the existing `request_id` from history. These descriptions guide the model; the server validates the UUID but cannot verify how ChatGPT generated it. After deploying the server change, refresh the existing Calocount connection in ChatGPT Plugins, confirm that all four tools are listed, and start a new chat ([Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)).

## Required server and Access setup

ChatGPT must reach the MCP server through a public HTTPS endpoint or Secure MCP Tunnel. A public endpoint uses Streamable HTTP, usually at `/mcp`. OpenAI explains this in [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

Before you deploy the Worker, verify that the Calocount Worker serves `POST /mcp`, exposes `add_meals`, `update_meal`, `get_nutrition_summary`, and `get_nutrition_history`, and routes `/mcp` to the Worker first with Wrangler `run_worker_first`.

The Worker must check each ChatGPT file `download_url` against its configured host allowlist before it fetches the image. Test with a real ChatGPT chat upload and record the actual download host. If that host differs from the allowlist, update the allowlist and redeploy. Do not allow arbitrary download hosts. Confirm that the Worker stores the image with the meal selected by `photo_meal_indices`, and test that one photo cannot attach to more than one meal.

Before deployment, verify that the existing Cloudflare Access application has an exact path rule for the Calocount host and `/mcp`, and that it still uses the owner's Allow policy. Keep this rule in place for the read tools. Confirm that Managed OAuth remains enabled for the existing `/mcp` application.

Each Access application has its own JWT audience. Verify that `CALOCOUNT_MCP_ACCESS_AUDIENCE` in the Calocount Worker environment matches the audience tag for the existing `/mcp` application. Keep `CALOCOUNT_ACCESS_AUDIENCE` set to the audience tag for the existing `/api/*` application. Do not reuse the `/api/*` audience for `/mcp`. Confirm that the Worker validates the signed Access JWT and checks the expected owner identity before it reads nutrition data or writes a meal. Test that a missing or wrong `CALOCOUNT_MCP_ACCESS_AUDIENCE` rejects the request. Cloudflare documents path rules, Managed OAuth, and audience and JWT validation ([Application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/), [Application token audience](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/), [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)).

Do not use the old Custom GPT bearer secret for this connection. ChatGPT signs in through Access Managed OAuth. The server must still validate the Access JWT and allow only the configured owner.

## Test in standard Chat

Use the owner's Personal Plus or Pro account in ChatGPT web. OpenAI's current [developer mode guide](https://developers.openai.com/api/docs/guides/developer-mode) says Plus and Pro can use MCP write tools in web developer mode. ChatGPT can ask for confirmation before a write. Confirm each test write in ChatGPT when it asks.

1. Deploy the Worker and confirm the HTTPS `/mcp` endpoint works. Finish the Cloudflare Access setup above first.
2. In ChatGPT Plugins, refresh the owner's existing Calocount developer-mode MCP connection. Confirm that ChatGPT lists exactly these four tools: `add_meals`, `update_meal`, `get_nutrition_summary`, and `get_nutrition_history`.
3. Start a new **standard Chat**. Use the `+` control in the composer, open **Developer mode**, and select the Calocount app. OpenAI also documents the app picker under `+` > **More** for supported chats ([Connect and test your plugin](https://developers.openai.com/plugins/build/app-quickstart)). Test the app in standard Chat. Do not switch to Work for this acceptance test.
4. Test the read tools with an inclusive UTC date range. Ask `get_nutrition_summary` for the range, then use `get_nutrition_history` with the same dates and `page_size: 1`. If the response has a `next_cursor`, request the next page with the same dates and page size plus that cursor.
5. Test an estimate-only request. Confirm that ChatGPT gives an estimate and does not call `add_meals`. A photo without a clear request to log also must not call the tool.
6. Clearly ask ChatGPT to log a meal. Confirm that it shows the estimate before the write, calls `add_meals`, and reports the returned result. Check the meal in Calocount. Retry with the same UUID and confirm that the server reports an existing meal without adding a duplicate.
7. Upload a meal photo and clearly ask ChatGPT to log the meal. Confirm that it sends only the file values supplied by ChatGPT and maps the photo to the correct meal. ChatGPT can say that the photo was stored only when the result has `has_image: true`. If ChatGPT supplies no file value, the meal can be logged without the photo.
8. Use `get_nutrition_history` to find one of the test meals and copy its `request_id`. Clearly ask ChatGPT to change one field. Confirm that it calls `update_meal` with the same ID, keeps the other values and any photo, and returns the updated meal. Repeat the original `add_meals` request with the same ID and confirm that it returns the edited meal without adding a duplicate or restoring old values.

## Skill draft

The skill draft and its portable manifest remain in the repository for possible future use. They are not linked to the registered ChatGPT app. OpenAI documents standalone skills in desktop clients and skills bundled with installed plugins in supported ChatGPT chats ([Build skills](https://learn.chatgpt.com/docs/build-skills)). Its [local marketplace instructions](https://developers.openai.com/plugins/build/plugins) do not establish that a repository-local install will reach this owner's Personal standard web Chat. Keep using the working MCP app unless that path is confirmed with a live test.
