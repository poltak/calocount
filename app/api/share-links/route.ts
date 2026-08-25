import {
  createShareLink,
  listShareLinks,
} from "../../../db/repository";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  optionalNumber,
  parseJsonBody,
  requireApiIdentity,
  requireString,
  withApiErrors,
} from "../_lib/http";

function publicShareLink(link: Awaited<ReturnType<typeof listShareLinks>>[number]) {
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

function parseExpiry(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const expiresAt = typeof value === "string"
    ? Date.parse(value)
    : optionalNumber(value, "expiresAt", { min: 0 });
  if (!Number.isFinite(expiresAt)) {
    throw new ApiError(400, "invalid_field", "expiresAt must be a valid date.");
  }
  if (expiresAt == null || expiresAt <= Date.now()) {
    throw new ApiError(400, "invalid_field", "expiresAt must be in the future.");
  }
  return Math.round(expiresAt);
}

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const links = await listShareLinks(getRequestDb(), identity.ownerKey);
    return jsonResponse({ links: links.map(publicShareLink) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const body = await parseJsonBody(request);
    const label = body.label == null
      ? body.label === null ? null : undefined
      : requireString(body.label, "label", { max: 120 });
    const link = await createShareLink(getRequestDb(), identity.ownerKey, {
      label,
      expiresAt: parseExpiry(body.expiresAt),
    });
    return jsonResponse({
      link: publicShareLink(link),
      url: new URL(`/share/${encodeURIComponent(link.token)}`, request.url).toString(),
    }, { status: 201 });
  });
}
