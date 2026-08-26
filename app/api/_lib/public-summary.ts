import type { getDashboardSummary } from "../../../db/repository";
import { projectPublicDashboardSummary } from "../share/_lib/projection";

type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;

type PublicSummaryResponseOptions = {
  ownerKey?: string | null;
  loadSummary: (ownerKey: string) => Promise<DashboardSummary>;
};

export class PublicSummaryConfigError extends Error {
  readonly status = 503;
  readonly code = "public_owner_key_missing";

  constructor() {
    super("The public dashboard is not configured.");
    this.name = "PublicSummaryConfigError";
  }
}

/**
 * Build the anonymous dashboard response from the one explicitly configured
 * owner. The caller must provide the configured key; no anonymous fallback is
 * allowed here.
 */
export async function buildPublicSummaryResponse({
  ownerKey,
  loadSummary,
}: PublicSummaryResponseOptions): Promise<Response> {
  const configuredOwnerKey = ownerKey?.trim();
  if (!configuredOwnerKey) {
    throw new PublicSummaryConfigError();
  }

  const summary = await loadSummary(configuredOwnerKey);
  return Response.json(projectPublicDashboardSummary(summary), {
    headers: { "cache-control": "no-store" },
  });
}
