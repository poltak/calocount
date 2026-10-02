import type { getDailyHistory, getDashboardSummary } from "../../../db/repository";
import { projectPublicDailyHistory, projectPublicDashboardSummary } from "./public-summary-projection";

type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;
type DailyHistory = Awaited<ReturnType<typeof getDailyHistory>>;

export const PUBLIC_SUMMARY_VIEWS = ["dashboard", "daily"] as const;
export type PublicSummaryView = (typeof PUBLIC_SUMMARY_VIEWS)[number];

type PublicSummaryResponseOptions = {
  ownerKey?: string | null;
  /** `dashboard` is the full projection the public page loads. `daily` is the small view for agents. */
  view?: PublicSummaryView;
  loadSummary: (ownerKey: string) => Promise<DashboardSummary>;
  loadDailyHistory: (ownerKey: string) => Promise<DailyHistory>;
};

export class PublicSummaryConfigError extends Error {
  readonly status = 503;
  readonly code = "public_owner_key_missing";

  constructor() {
    super("The public dashboard is not configured.");
    this.name = "PublicSummaryConfigError";
  }
}

/** The view a `view` query value asks for, or null when the value is not supported. */
export function parsePublicSummaryView(value: string | null): PublicSummaryView | null {
  if (value === null) return "dashboard";
  return PUBLIC_SUMMARY_VIEWS.find((view) => view === value) ?? null;
}

/**
 * Build the anonymous dashboard response from the one explicitly configured
 * owner. The caller must provide the configured key; no anonymous fallback is
 * allowed here.
 */
export async function buildPublicSummaryResponse({
  ownerKey,
  view = "dashboard",
  loadSummary,
  loadDailyHistory,
}: PublicSummaryResponseOptions): Promise<Response> {
  const configuredOwnerKey = ownerKey?.trim();
  if (!configuredOwnerKey) {
    throw new PublicSummaryConfigError();
  }

  const body = view === "daily"
    ? projectPublicDailyHistory(await loadDailyHistory(configuredOwnerKey))
    : projectPublicDashboardSummary(await loadSummary(configuredOwnerKey));
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
  });
}
