import {
  externalPhotoType,
  type ExternalPhotoRef,
} from "../../entries/types.js";
import { McpToolError } from "./mcp-tool-error.js";

const OPENAI_FILE_BASE_DOMAIN = "oaiusercontent.com";
// Public Azure Blob account hosts can vary between ChatGPT file handoffs.
const AZURE_BLOB_ACCOUNT_HOST =
  /^[a-z0-9]{3,24}(?:-secondary)?\.blob\.core\.windows\.net$/u;
const OPENAI_FILE_HOSTS = new Set([
  "files.oaiusercontent.com",
  "files.openai.com",
]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function isAllowedHost(hostname: string): boolean {
  return (
    OPENAI_FILE_HOSTS.has(hostname) ||
    hostname.endsWith(`.${OPENAI_FILE_BASE_DOMAIN}`) ||
    AZURE_BLOB_ACCOUNT_HOST.test(hostname)
  );
}

/** Why a download link is refused, or `null` when the Worker may fetch it. */
function refusalReason({
  value,
  allowLocalHttp,
}: {
  value: string;
  allowLocalHttp: boolean;
}): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return "malformed_download_url";
  }
  const hostname = parsed.hostname.toLowerCase();
  // A black-box test serves its image from a local server. No other Worker may fetch an address of its own machine.
  if (
    allowLocalHttp &&
    parsed.protocol === "http:" &&
    LOCAL_HOSTS.has(hostname)
  ) {
    return null;
  }
  if (parsed.protocol !== "https:") {
    return "unsupported_scheme";
  }
  if (parsed.username || parsed.password || parsed.port) {
    return "credentials_or_port";
  }
  if (!parsed.pathname || parsed.pathname === "/") {
    return "missing_path";
  }
  return isAllowedHost(hostname) ? null : "unsupported_host";
}

/**
 * The photo that an agent attached to a meal. Only the file hosts of ChatGPT
 * are fetched, over HTTPS, so that the agent cannot make the Worker call any
 * address. The error names the reasons and never the link, which holds a
 * signature.
 */
export function photoRefOf({
  photo,
  allowLocalHttp,
}: {
  photo: { downloadUrl: string; mimeType: unknown };
  allowLocalHttp: boolean;
}): ExternalPhotoRef {
  const declaredType =
    typeof photo.mimeType === "string"
      ? externalPhotoType(photo.mimeType)
      : null;
  const reason = refusalReason({ value: photo.downloadUrl, allowLocalHttp });
  if (reason !== null) {
    throw new McpToolError(
      "invalid_image_refs",
      `openaiFileIdRefs contains no usable image. Reasons: ${reason}.`,
    );
  }
  return {
    downloadUrl: new URL(photo.downloadUrl.trim()).toString(),
    ...(declaredType ? { declaredType } : {}),
  };
}
