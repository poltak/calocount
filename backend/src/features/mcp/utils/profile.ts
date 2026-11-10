/** The logs of one instance. They share one sign-in. */
export const PROFILES = ["owner", "partner"] as const;
export type Profile = (typeof PROFILES)[number];

export function isProfile(value: unknown): value is Profile {
  return value === "owner" || value === "partner";
}

/** The data key of a profile. The owner keeps the account key, so existing data stays where it is. */
export function profileDataKey({
  accountKey,
  profile,
}: {
  accountKey: string;
  profile: Profile;
}): string {
  return profile === "partner" ? `${accountKey}:partner` : accountKey;
}
