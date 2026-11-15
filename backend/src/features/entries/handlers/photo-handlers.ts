import { Hono } from "hono";
import { AppError } from "../../core/errors/app-error.js";
import type { BackendLogic } from "../../core/types.js";
import { isSafePhotoKey } from "../utils/meal-photo.js";
import type { SessionEnvironment } from "./types.js";

interface PhotoHandlerProps {
  logic: Pick<BackendLogic, "entries">;
}

const CACHE_CONTROL = "private, max-age=300";

/**
 * The key from the path. The client encodes each segment, so a `%` or a `/`
 * inside a segment survives. The router decodes the whole path once, so
 * this reads the segments from the URL itself.
 */
function photoKeyOf(url: string): string | null {
  const { pathname } = new URL(url);
  const prefix = "/photos/";
  const encoded = pathname.slice(pathname.indexOf(prefix) + prefix.length);
  try {
    return encoded.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
}

/** The private image of an entry, at `/api/photos/<key>`. */
export function createPhotoHandlers({ logic }: PhotoHandlerProps) {
  return new Hono<SessionEnvironment>().get("/:key{.+}", async (context) => {
    const photoKey = photoKeyOf(context.req.url);
    if (photoKey === null || !isSafePhotoKey(photoKey)) {
      throw new AppError({
        code: "INVALID_REQUEST",
        message: "The photo key is invalid.",
      });
    }
    const result = await logic.entries.readPhoto({
      ownerKey: context.get("session").ownerKey,
      photoKey,
      ifNoneMatch: context.req.header("if-none-match") ?? null,
    });
    if (result.type === "notModified") {
      return new Response(null, {
        status: 304,
        headers: { "cache-control": CACHE_CONTROL, etag: result.etag },
      });
    }
    const { object } = result;
    const metadata = object.httpMetadata ?? {};
    return new Response(object.body, {
      headers: {
        "cache-control": CACHE_CONTROL,
        etag: object.httpEtag,
        "content-length": String(object.size),
        "content-type": metadata.contentType ?? "application/octet-stream",
        ...(metadata.contentLanguage
          ? { "content-language": metadata.contentLanguage }
          : {}),
        ...(metadata.contentDisposition
          ? { "content-disposition": metadata.contentDisposition }
          : {}),
      },
    });
  });
}
