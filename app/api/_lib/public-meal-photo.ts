import type { getDashboardSummary } from "../../../db/repository";
import { isPublicPhotoMimeType, isWithinPublicDateRange } from "./public-photo-policy";
import { PublicSummaryConfigError } from "./public-summary";

type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;

type PublicPhotoObject = {
  body: BodyInit | null;
  httpEtag: string;
  size: number;
};

type PublicMealPhotoResponseOptions = {
  ownerKey?: string | null;
  mealId?: string | null;
  ifNoneMatch?: string | null;
  loadSummary: (ownerKey: string) => Promise<DashboardSummary>;
  loadPhoto: (photoKey: string) => Promise<PublicPhotoObject | null>;
};

const publicPhotoCacheControl = "public, max-age=0, must-revalidate";

function notFoundResponse(): Response {
  return Response.json(
    { error: { code: "not_found", message: "Photo not found." } },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

export function isPublicMealId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,120}$/.test(value);
}

/**
 * Stream one photo already included in the anonymous seven-day projection.
 * The public URL uses the meal ID so the private R2 key never crosses the API.
 */
export async function buildPublicMealPhotoResponse({
  ownerKey,
  mealId,
  ifNoneMatch,
  loadSummary,
  loadPhoto,
}: PublicMealPhotoResponseOptions): Promise<Response> {
  const configuredOwnerKey = ownerKey?.trim();
  if (!configuredOwnerKey) throw new PublicSummaryConfigError();

  const requestedMealId = mealId?.trim();
  if (!requestedMealId || !isPublicMealId(requestedMealId)) return notFoundResponse();

  const summary = await loadSummary(configuredOwnerKey);
  const entry = summary.recentMeals.find(({ meal }) => (
    meal.id === requestedMealId
    && meal.status === "complete"
    && Boolean(meal.photoKey)
    && isPublicPhotoMimeType(meal.photoMimeType)
    && isWithinPublicDateRange({ consumedAt: meal.consumedAt, summaryDate: summary.date })
  ));
  if (!entry?.meal.photoKey || !entry.meal.photoMimeType) return notFoundResponse();

  const object = await loadPhoto(entry.meal.photoKey);
  if (!object) return notFoundResponse();

  if (ifNoneMatch === object.httpEtag) {
    return new Response(null, {
      status: 304,
      headers: {
        "cache-control": publicPhotoCacheControl,
        etag: object.httpEtag,
        "x-content-type-options": "nosniff",
      },
    });
  }

  return new Response(object.body, {
    headers: {
      "cache-control": publicPhotoCacheControl,
      "content-disposition": "inline",
      "content-length": String(object.size),
      "content-type": entry.meal.photoMimeType,
      etag: object.httpEtag,
      "x-content-type-options": "nosniff",
    },
  });
}
