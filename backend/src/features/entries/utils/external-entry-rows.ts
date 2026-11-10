import type { NewMealItem, NewMealLog } from "../storage/types.js";
import type { ExternalMealRequest } from "../types.js";
import { buildEntryRows } from "./entry-rows.js";

/**
 * The rows of a meal that an agent logs. The IDs come from the request ID, so
 * a retry builds the same rows and the insert ignores them.
 */
export function buildExternalEntryRows({
  ownerKey,
  request,
  timestamp,
}: {
  ownerKey: string;
  request: ExternalMealRequest;
  timestamp: number;
}): { meal: NewMealLog; items: NewMealItem[] } {
  const source = "chatgpt";
  return buildEntryRows({
    ownerKey,
    timestamp,
    input: {
      id: `meal_external_${request.requestId}`,
      consumedAt: request.consumedAt,
      source,
      caption: request.name,
      externalRequestId: request.requestId,
      items: [
        {
          id: `item_external_${request.requestId}`,
          name: request.name,
          quantity: 1,
          unit: "serving",
          calories: request.kcal,
          proteinG: request.protein,
          carbsG: request.carbs,
          fatG: request.fat,
          source,
          ...request.nutrients,
        },
      ],
    },
  });
}
