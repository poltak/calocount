---
name: meal-tracking
description: Estimate meal nutrition and log meals to the user's Calocount tracker when they clearly ask to save, add, track, or record a meal.
---

# Calocount meal tracking

Use this skill to estimate meal nutrition and to log meals in Calocount. Use the `add_meals` MCP tool only when the user clearly asks to log a meal.

## Estimate nutrition

For each food or meal, estimate the full serving's calories in kcal, protein in grams, carbohydrates in grams, and fat in grams.

When evidence supports it, also estimate these nutrients:

- Carbohydrates: `fiberG`, `totalSugarsG`
- Fats and lipids: `saturatedFatG`, `monounsaturatedFatG`, `polyunsaturatedFatG`, `omega3G`, `cholesterolMg`
- Vitamins: `vitaminAMcgRae`, `vitaminCMg`, `vitaminDMcg`, `vitaminEMg`, `vitaminKMcg`, `vitaminB6Mg`, `folateMcgDfe`, `vitaminB12Mcg`
- Minerals: `sodiumMg`, `potassiumMg`, `calciumMg`, `ironMg`, `magnesiumMg`, `phosphorusMg`, `zincMg`, `seleniumMcg`
- Other: `caffeineMg`

Use only these supported detailed nutrient fields. Do not split fiber into soluble and insoluble fiber. Do not split omega-3 into ALA, EPA, or DHA.

Make realistic estimates. Do not use false precision. Nutrient values must be zero or greater. Unknown is not zero. Use zero only when evidence shows that a nutrient is absent. In a reply, write `unknown` when evidence is not enough. In the tool input, omit unknown and unsupported nutrient fields.

Use food labels, nutrition data, weights, serving sizes, ingredients, cooking methods, visible portions, and user context. Treat a supplied label as stronger evidence than a generic estimate. Use an exact weight when the user gives one. Use cooked weight for cooked food unless the user says otherwise. For mixed dishes, estimate each major part and add the values. Include oil, butter, sauces, sugar, dressings, batter, cheese, and fortified foods or drinks when there is evidence for them. Do not assume large amounts of these items without evidence. Exclude all food that the user says they did not eat.

When the user supplies a photo, use it with the written description if the image is visible to you. Treat visual portions as estimates. Do not claim that the image gives exact weights or nutrient values. Mention important uncertainty briefly. Do not ask questions that are not needed when a reasonable estimate is possible.

## Reply with the estimate

Show calories and macros first. Use a compact format such as:

**Estimated total: 620 kcal**

- Protein: 42 g
- Carbs: 58 g
- Fat: 24 g

Then show useful detailed estimates in groups: carbohydrates, fats and lipids, vitamins, minerals, and other. Mark unknown values as `unknown`. Do not add values to fill the list. Give a short component breakdown for a complex meal when it helps. Keep the reply concise unless the user asks for more detail.

## Decide whether to log

Words such as `log`, `save`, `add`, `track`, and `record` in the original meal request show clear intent to log. For example, `I ate chicken and rice, log it` and `log this: chicken and rice` are clear requests. Estimate and show the meal first. Then call `add_meals` in the same turn. Do not ask for another confirmation when the user has already asked to log it.

For an estimate-only request, an ambiguous request, or a photo by itself, do not call the tool. If intent is unclear, give the estimate and ask whether the user wants to log it. A later `yes`, `log it`, or `do it` is clear intent. Do not ask whether to log an estimate unless logging seems relevant.

## Call `add_meals`

Show the estimate before the tool call. Then call `add_meals` with one argument object. Include a `meals` array. Add `photos` and `photo_meal_indices` only when ChatGPT provides file values for user photos that should be stored with these meals.

For each meal:

1. Create a new UUID for `request_id`. Use a different UUID for each meal. Reuse that UUID only to retry the same request after an error, timeout, or unclear result. Never reuse it for a different meal.
2. Set `eaten_at` to an ISO 8601 date and time with an explicit UTC offset. Use the date and time the user gave. If the user gives a time without an offset, use the user's local time zone. If the user gives no date or time, use the current time in the user's local time zone. If you cannot determine the local time zone, ask the user before logging.
3. Give `name` a short, useful description. Include a known weight or identifying detail when it helps.
4. Include `request_id`, `name`, `kcal`, `protein`, `carbs`, `fat`, and `eaten_at`. Add a `nutrients` object only for useful supported estimates for the full meal. Omit unknown and unsupported fields.
5. If the user shared one or more photos and clearly asked to log the meal, attach each original photo in the top-level `photos` array. Use only the file values that ChatGPT provides for those photos. Keep each file value as provided, including `download_url`, `file_id`, and any `mime_type` or `file_name`. Do not invent or change a URL or file ID.
6. Add one zero-based integer to `photo_meal_indices` for each entry in `photos`. Each integer points to the meal in `meals` that matches that photo. For example, `photos[0]` with `photo_meal_indices[0]` equal to `1` belongs to `meals[1]`. The two arrays must have the same length. Attach no more than one photo to each meal and no more than 20 photos in one call. If there are no photos to store, omit both arrays.
7. A photo by itself does not mean that the user wants to log a meal. For an estimate-only request or an unclear request, do not call the tool and do not attach the photo. If the user clearly asks to log but ChatGPT does not provide a file value for the photo, log the meal without a photo. Do not make up a file value.

Put one or more meal objects in `meals`. Use one tool call for a batch of up to 20 meals. Use one new UUID for each meal. If the user asks to log more than 20 meals, use more than one call, with no more than 20 meals per call. Put each photo and its meal index in the same call as that meal.

The batch write is all or nothing: all new rows are stored, or none are stored. A retry with the same UUIDs is safe. The tool can return `already_exists` for meals that were stored before the retry.

## Explain the tool result

- For `created`, say that Calocount logged the meal.
- For `already_exists`, say that the meal was already logged and no duplicate was created.
- For `batch_processed`, use `created_count` and `already_exists_count` to explain the result. Do not say a duplicate was created for an `already_exists` meal.
- For a meal with a submitted photo, say that Calocount stored the photo only when that meal's result has `has_image: true`. If this field is false or missing, do not claim that the photo was stored. Explain that photo storage was not confirmed when this matters.
- If the result includes `daily_totals`, report `daily_totals.kcal` and `daily_totals.protein` for the current logical day. Include the date when it helps. For a batch, describe each meal result, then report the daily total once.
- If the call fails or the result does not show whether the meal was stored, say that logging failed or is uncertain. Do not claim success. If you retry, use the same UUIDs and the same confirmed nutrition values.

In the final reply, show the estimate before the logging result. Follow any confirmation that ChatGPT itself requires for a write action.

## Protect account access

ChatGPT and Cloudflare Access handle sign-in. Never ask for, send, reveal, or repeat an API key, bearer token, or Access credential. Do not put credentials in tool input or normal replies.
