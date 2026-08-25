import { revokeShareLink } from "../../../../db/repository";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  requireApiIdentity,
  withApiErrors,
} from "../../_lib/http";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

function publicShareLink(link: NonNullable<Awaited<ReturnType<typeof revokeShareLink>>>) {
  const expiresAt = link.expiresAt == null ? null : new Date(link.expiresAt).toISOString();
  const revokedAt = link.revokedAt == null ? null : new Date(link.revokedAt).toISOString();
  return {
    id: link.id,
    label: link.label,
    createdAt: new Date(link.createdAt).toISOString(),
    expiresAt,
    revokedAt,
    status: revokedAt ? "revoked" : expiresAt && Date.parse(expiresAt) <= Date.now() ? "expired" : "active",
  };
}

async function shareLinkId(context: RouteContext): Promise<string> {
  const id = (await context.params).id?.trim();
  if (!id || id.length > 120) throw new ApiError(400, "invalid_id", "The share link ID is invalid.");
  return id;
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const link = await revokeShareLink(getRequestDb(), identity.ownerKey, await shareLinkId(context));
    if (!link) throw new ApiError(404, "not_found", "Share link not found.");
    return jsonResponse({ revoked: true, link: publicShareLink(link) });
  });
}
