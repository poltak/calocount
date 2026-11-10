import { oauthUrls } from "./oauth-urls.js";

/** HTTPS, or HTTP on this computer for local tools. No fragment, and no user name or password. */
export function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) {
    return false;
  }
  if (url.protocol === "https:") {
    return true;
  }
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  // Remove control characters, so a name cannot break the consent page layout.
  // oxlint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text ? text.slice(0, maxLength) : null;
}

export function redirectUrisOf(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/** Add the response parameters and the issuer to a redirect URI. */
export function redirectWith({
  redirectUri,
  origin,
  params,
}: {
  redirectUri: string;
  origin: string;
  params: Record<string, string | null>;
}): string {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== null) {
      url.searchParams.set(name, value);
    }
  }
  url.searchParams.set("iss", oauthUrls(origin).issuer);
  return url.toString();
}
