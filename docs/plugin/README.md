# Calocount private MCP app

The owner's standard Chat uses the existing Calocount MCP connection in ChatGPT developer mode. After deployment and refresh, it exposes five tools: `add_meals`, `update_meal`, `get_nutrition_summary`, `get_nutrition_history`, and `get_weight_history`. The repository also contains a plugin package with a [meal-tracking skill](../../plugins/calocount-meal-tracker/skills/meal-tracking/SKILL.md). The package links the skill to the registered MCP app. See [Install the skill with the app](#install-the-skill-with-the-app).

The tool contract is one argument object with a `meals` array and optional top-level `photos` and `photo_meal_indices` arrays. It accepts 1 to 20 meals in a call. Each meal follows the schema of the `add_meals` tool. Each `photos` entry is a ChatGPT file value. The entry at `photos[i]` belongs to the meal at `meals[photo_meal_indices[i]]`; indices start at zero. Both arrays must have the same length, with no more than one photo per meal and 20 photos per call. The tool returns the meal batch result, `daily_totals`, and whether each meal has an image.

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

The MCP server sends short workflow instructions during initialization. Its `add_meals` tool description and `request_id` field description ask ChatGPT to generate a UUID v4 with a code tool when available and reuse it only for an exact retry. The `update_meal` tool uses the existing `request_id` from history. These descriptions guide the model; the server validates the UUID but cannot verify how ChatGPT generated it. The instructions and the `nutrients` field descriptions also ask ChatGPT to estimate every supported nutrient, and to use null only when no reasonable estimate exists. When `add_meals` saves a new meal without nutrient values, the result text names the meal and tells ChatGPT to add them with `update_meal`. The server does not reject such a meal. After deploying the server change, refresh the existing Calocount connection in ChatGPT Plugins, confirm that all five tools are listed, and start a new chat ([Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)).

## Sign-in for the MCP connection

Calocount is its own OAuth authorization server. See
[sign-in.md](../sign-in.md).

### OAuth

1. In ChatGPT web, turn on developer mode for apps, and create a new app.
2. Use the MCP server URL `https://<your-calocount-host>/mcp`, and select
   OAuth as the authentication. Leave any client ID and client secret fields
   empty. ChatGPT finds the OAuth endpoints from the `/mcp` answer and registers
   itself with Calocount.
3. ChatGPT opens a Calocount page. If Calocount asks, sign in with your
   passkey. On **Connect ChatGPT to Calocount?**, check that the page names
   `chatgpt.com`, then select **Allow**.
4. Confirm that ChatGPT lists the five tools. Calocount shows ChatGPT under
   **Settings > Sign-in > Connected apps**.

ChatGPT refreshes its token without help. The connection works until you
disconnect it, or until ChatGPT does not use it for 180 days. To stop it,
select **Disconnect** in Calocount or remove the app in ChatGPT.

To check the server without ChatGPT, send a request without a token. It must
return `401` with a `WWW-Authenticate` header that names
`/.well-known/oauth-protected-resource/mcp`:

```bash
curl -i -X POST https://<your-calocount-host>/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Test in standard Chat

Use the owner's Personal Plus or Pro account in ChatGPT web. OpenAI's current [developer mode guide](https://developers.openai.com/api/docs/guides/developer-mode) says Plus and Pro can use MCP write tools in web developer mode. ChatGPT can ask for confirmation before a write. Confirm each test write in ChatGPT when it asks.

1. Deploy the Worker and confirm the HTTPS `/mcp` endpoint works. Finish the sign-in setup above first.
2. In ChatGPT Plugins, refresh the owner's existing Calocount developer-mode MCP connection. Confirm that ChatGPT lists exactly these five tools: `add_meals`, `update_meal`, `get_nutrition_summary`, `get_nutrition_history`, and `get_weight_history`.
3. Start a new **standard Chat**. Use the `+` control in the composer, open **Developer mode**, and select the Calocount app. OpenAI also documents the app picker under `+` > **More** for supported chats ([Connect and test your plugin](https://developers.openai.com/plugins/build/app-quickstart)). Test the app in standard Chat. Do not switch to Work for this acceptance test.
4. Test the read tools with an inclusive date range. The dates are days in the owner's saved timezone, which each result returns as `timezone`. Ask `get_nutrition_summary` for the range, then use `get_nutrition_history` with the same dates and `page_size: 1`. If the response has a `next_cursor`, request the next page with the same dates and page size plus that cursor. Ask `get_weight_history` for the same range and confirm that it returns the recorded weights in kilograms, oldest first.
5. Test an estimate-only request. Confirm that ChatGPT gives an estimate and does not call `add_meals`. A photo without a clear request to log also must not call the tool.
6. Clearly ask ChatGPT to log a meal. Confirm that it shows the estimate before the write, calls `add_meals`, and reports the returned result. Check the meal in Calocount. Retry with the same UUID and confirm that the server reports an existing meal without adding a duplicate.
7. Upload a meal photo and clearly ask ChatGPT to log the meal. Confirm that it sends only the file values supplied by ChatGPT and maps the photo to the correct meal. ChatGPT can say that the photo was stored only when the result has `has_image: true`. If ChatGPT supplies no file value, the meal can be logged without the photo.
8. Use `get_nutrition_history` to find one of the test meals and copy its `request_id`. Clearly ask ChatGPT to change one field. Confirm that it calls `update_meal` with the same ID, keeps the other values and any photo, and returns the updated meal. Repeat the original `add_meals` request with the same ID and confirm that it returns the edited meal without adding a duplicate or restoring old values.

## Install the skill with the app

The MCP connection alone gives ChatGPT only the server instructions and the tool descriptions. The skill gives the full estimate and logging rules. OpenAI makes skills that are bundled in an installed plugin available in Chat and Work on ChatGPT web, desktop, and mobile ([Build skills](https://learn.chatgpt.com/docs/build-skills)).

The package has these parts:

- `plugins/calocount-meal-tracker/plugin.json`: the portable manifest. `extensions.com.openai.apps` points to `./.app.json`.
- `plugins/calocount-meal-tracker/skills/meal-tracking/SKILL.md`: the skill.
- `plugins/calocount-meal-tracker/.app.json`: maps the plugin to the registered MCP app of your instance. Git ignores this file, because each instance has its own app ID. Copy `.app.example.json` to `.app.json` and replace the ID.
- `.agents/plugins/marketplace.json`: the local marketplace entry for the package.

To install it:

1. In [ChatGPT Plugins](https://chatgpt.com/plugins), open your Calocount app. Copy the `plugin_asdk_app_...` ID from the browser URL into `.app.json`.
2. Make the marketplace available to the ChatGPT desktop app. Use the repository entry in `.agents/plugins/marketplace.json`, or add the same entry to `~/.agents/plugins/marketplace.json`. The `path` is relative to the marketplace root and must stay inside it ([Build plugins](https://developers.openai.com/plugins/build/plugins)).
3. Restart the ChatGPT desktop app, and install `calocount-meal-tracker` from the Plugins Directory.
4. Start a new standard Chat on the web. Select Calocount and ask it to log a meal. Confirm that the reply and the `add_meals` call include detailed nutrients, not only calories and macros.

ChatGPT keeps a copy of the installed package in `~/.codex/plugins/cache/`. After you change the skill, increase `version` in `plugin.json`, then restart the desktop app.

OpenAI documents the local install through the desktop app only. A live test must confirm that the installed skill reaches standard web Chat for a Personal account. Until it does, the server instructions and tool descriptions still carry the core nutrient rule.
