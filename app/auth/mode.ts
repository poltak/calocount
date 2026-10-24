/** The sign-in methods of the owner dashboard, the owner API and the MCP endpoint. */
export const AUTH_MODES = ["passkey", "access"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/**
 * The sign-in method of an instance. `CALOCOUNT_AUTH_MODE` selects it. Without
 * that value, an instance that has Cloudflare Access values keeps Access, and
 * every other instance uses passkeys. Returns null for an unknown value, so
 * the caller fails closed.
 */
export function resolveAuthMode({ mode, accessTeamDomain, accessAudience }: {
  mode?: string | null;
  accessTeamDomain?: string | null;
  accessAudience?: string | null;
}): AuthMode | null {
  const value = mode?.trim().toLowerCase();
  if (value) return AUTH_MODES.find((known) => known === value) ?? null;
  return accessTeamDomain?.trim() && accessAudience?.trim() ? "access" : "passkey";
}
