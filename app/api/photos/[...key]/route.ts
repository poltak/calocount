import {
  getRequestDb,
  getPhotosBucket,
  jsonResponse,
  requireApiIdentity,
  withApiErrors,
} from "../../_lib/http";
import { findMealByPhotoKey } from "../../../../db/repository";

type RouteContext = { params: Promise<{ key: string[] }> | { key: string[] } };

function safePhotoKey(value: string[] | string): string {
  const key = (Array.isArray(value) ? value.join("/") : value).trim();
  const hasControlCharacter = [...key].some((character) => character.charCodeAt(0) < 32);
  if (!key || key.length > 1_000 || key.startsWith("/") || key.includes("..") || hasControlCharacter) {
    throw new Error("invalid_photo_key");
  }
  return key;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = requireApiIdentity(request);
    const params = await context.params;
    let key: string;
    try {
      key = safePhotoKey(params.key);
    } catch {
      return jsonResponse({ error: { code: "invalid_photo_key", message: "The photo key is invalid." } }, { status: 400 });
    }
    const meal = await findMealByPhotoKey(getRequestDb(), identity.ownerKey, key);
    if (!meal) return jsonResponse({ error: { code: "not_found", message: "Photo not found." } }, { status: 404 });
    const object = await getPhotosBucket().get(key);
    if (!object) return jsonResponse({ error: { code: "not_found", message: "Photo not found." } }, { status: 404 });
    if (request.headers.get("if-none-match") === object.httpEtag) return new Response(null, { status: 304 });
    const metadata = object.httpMetadata ?? {};
    return new Response(object.body, {
      headers: {
        "cache-control": "private, max-age=300",
        etag: object.httpEtag,
        "content-length": String(object.size),
        "content-type": metadata.contentType ?? "application/octet-stream",
        ...(metadata.contentLanguage ? { "content-language": metadata.contentLanguage } : {}),
        ...(metadata.contentDisposition ? { "content-disposition": metadata.contentDisposition } : {}),
      },
    });
  });
}
