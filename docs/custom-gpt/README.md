# Calocount custom GPT setup

This directory contains reusable files for a custom GPT that estimates meal nutrition and logs explicitly requested meals to a Calocount deployment.

- [`instructions.md`](./instructions.md) contains the GPT instructions.
- [`action-schema.yaml`](./action-schema.yaml) defines the `addMeal` action.

## Requirements

You need:

- A deployed Calocount app with a public HTTPS origin.
- Access to create or edit a custom GPT in ChatGPT.
- A long, random value for `CALOCOUNT_CHATGPT_MEAL_TOKEN`.

The `/api/add-meal` route must be reachable from ChatGPT. It uses its bearer token for authentication, so do not place this route behind an interactive sign-in page.

## 1. Configure the Calocount deployment

Set the meal action token as a secret in the environment that runs Calocount. For a Cloudflare Worker deployment, run:

```sh
pnpm exec wrangler secret put CALOCOUNT_CHATGPT_MEAL_TOKEN
```

Enter a long, random secret at the prompt. Do not commit it to this repository or add it to the action schema.

Deploy the app, then note its public origin. The origin must not include a path or a trailing slash. Examples are `https://calocount.example.com` or a Worker origin.

## 2. Prepare the templates

Make working copies of the two template files and replace these placeholders:

| File | Placeholder | Replace with |
| --- | --- | --- |
| `action-schema.yaml` | `https://YOUR-CALOCOUNT-HOST.example.com` | The public HTTPS origin of your Calocount deployment |
| `instructions.md` | `YOUR_DEFAULT_IANA_TIMEZONE` | The fallback IANA timezone for the user, such as `Europe/London` or `America/New_York` |

Do not replace a placeholder with an API token. Enter the token separately in the GPT action authentication settings.

## 3. Create the GPT

1. Open the GPT editor in ChatGPT and create a GPT.
2. Open its configuration view.
3. Copy the full contents of the prepared `instructions.md` file into the **Instructions** field.
4. Enable **Code Interpreter & Data Analysis** so the GPT can generate request UUIDs as instructed.
5. In **Actions**, select **Create new action**.
6. Paste the prepared `action-schema.yaml` file into the schema editor.
7. Set **Authentication** to **API key**.
8. Select **Bearer** authentication.
9. Enter the same secret that you stored as `CALOCOUNT_CHATGPT_MEAL_TOKEN`.
10. Save the action.

ChatGPT reads the server origin from the OpenAPI schema and sends the saved token in the `Authorization: Bearer …` header. Keep the token only in the Calocount deployment secret store and the GPT authentication settings.

## 4. Test the action

Use the GPT preview and give it a simple meal, for example:

> I ate 150 g of cooked chicken breast and 200 g of cooked rice.

Check these behaviors:

1. The GPT estimates calories, protein, carbohydrates, fat, and useful detailed nutrients.
2. A request that includes clear logging intent, such as "log this meal", calls `addMeal` without a second confirmation.
3. A request that asks only for an estimate does not call `addMeal`.
4. After logging, the action returns `created` and `daily_totals` with the current logical day's calories and protein.
5. Repeating the same action request with the same `request_id` returns `already_exists` and does not create a duplicate.
6. A request that clearly logs multiple meals sends one `meals` batch, and the response reports each result plus one `daily_totals` value.
7. A meal photo is optional and is sent only when the user supplied one for that meal.

If the action returns `401`, confirm that the GPT bearer token and the deployed `CALOCOUNT_CHATGPT_MEAL_TOKEN` are identical. If the action cannot connect, confirm that the schema origin is public HTTPS and that `/api/add-meal` is not behind an interactive access screen.

## Sharing the GPT

A GPT that is shared by link or published with an action can require a valid privacy policy URL. Review the GPT sharing settings and the action domain rules for your ChatGPT workspace before you publish it.

See OpenAI's current guides for [creating and editing GPTs](https://help.openai.com/en/articles/8554397) and [configuring actions in GPTs](https://help.openai.com/en/articles/9442513).
