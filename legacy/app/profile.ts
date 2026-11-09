/** The logs of one instance. They share one sign-in. */
export const PROFILES = ["owner", "partner"] as const;
export type Profile = typeof PROFILES[number];

export function isProfile(value: unknown): value is Profile {
  return value === "owner" || value === "partner";
}

/** The profile of a `profile` query value. No value is the owner. Null for an unknown value. */
export function parseProfile(value: string | null): Profile | null {
  if (value === null) return "owner";
  return isProfile(value) ? value : null;
}

/** The data key of a profile. The owner keeps the account key, so existing data stays where it is. */
export function profileDataKey({ accountKey, profile }: { accountKey: string; profile: Profile }): string {
  return profile === "partner" ? `${accountKey}:partner` : accountKey;
}

/** The profile of an owner dashboard path. */
export function profileFromPath(pathname: string): Profile {
  return pathname === "/owner/partner" ? "partner" : "owner";
}

/** Add the profile to a private API URL. An owner URL does not change. */
export function withProfile({ url, profile }: { url: string; profile: Profile }): string {
  return profile === "partner" ? `${url}${url.includes("?") ? "&" : "?"}profile=partner` : url;
}
