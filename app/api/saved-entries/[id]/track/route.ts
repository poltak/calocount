import { trackSavedEntry } from "../../../../../db/repository";
import { ApiError, getRequestDb, jsonResponse, parseJsonBody, requireApiIdentity, withApiErrors } from "../../../_lib/http";
import { serialiseMeal } from "../../../_lib/serialise";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function savedEntryId(context: RouteContext): Promise<string> {
  const id = (await context.params).id?.trim();
  if (!id || id.length > 120) throw new ApiError(400, "invalid_id", "The saved entry ID is invalid.");
  return id;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const body = request.body ? await parseJsonBody(request) : {};
    const consumedAt = body.consumedAt == null ? Date.now() : Number(body.consumedAt);
    if (!Number.isFinite(consumedAt) || consumedAt < 0) {
      throw new ApiError(400, "invalid_field", "consumedAt must be a valid timestamp.");
    }
    const entry = await trackSavedEntry(getRequestDb(), identity.ownerKey, await savedEntryId(context), consumedAt);
    if (!entry) throw new ApiError(404, "not_found", "Saved entry not found.");
    return jsonResponse({ entry: serialiseMeal(entry) }, { status: 201 });
  });
}
