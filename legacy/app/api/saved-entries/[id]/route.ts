import { removeSavedEntry } from "../../../../db/repository";
import { ApiError, getRequestDb, jsonResponse, requireApiIdentity, withApiErrors } from "../../_lib/http";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function savedEntryId(context: RouteContext): Promise<string> {
  const id = (await context.params).id?.trim();
  if (!id || id.length > 120) throw new ApiError(400, "invalid_id", "The saved entry ID is invalid.");
  return id;
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const id = await savedEntryId(context);
    if (!(await removeSavedEntry(getRequestDb(), identity.ownerKey, id))) {
      throw new ApiError(404, "not_found", "Saved entry not found.");
    }
    return jsonResponse({ deleted: true, entryId: id });
  });
}
