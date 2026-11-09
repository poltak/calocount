import { listSavedEntries, saveEntry } from "../../../db/repository";
import { ApiError, getRequestDb, jsonResponse, parseJsonBody, requireApiIdentity, withApiErrors } from "../_lib/http";
import { serialiseSavedEntries, serialiseSavedEntry } from "../_lib/serialise";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const entries = await listSavedEntries(getRequestDb(), identity.ownerKey);
    return jsonResponse({ entries: serialiseSavedEntries(entries) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const body = await parseJsonBody(request);
    const sourceEntryId = typeof body.sourceEntryId === "string" ? body.sourceEntryId.trim() : "";
    if (!sourceEntryId || sourceEntryId.length > 120) {
      throw new ApiError(400, "invalid_id", "The entry ID is invalid.");
    }
    const entry = await saveEntry(getRequestDb(), identity.ownerKey, sourceEntryId);
    if (!entry) throw new ApiError(404, "not_found", "Entry not found.");
    return jsonResponse({ entry: serialiseSavedEntry(entry) }, { status: 201 });
  });
}
