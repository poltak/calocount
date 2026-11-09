import type { getDailyHistory, getDashboardSummary, getDayLog, getMonthTotals } from "../../../db/repository";
import {
  projectPublicDailyHistory,
  projectPublicDashboardSummary,
  projectPublicDayLog,
  projectPublicMonthTotals,
} from "./public-summary-projection";

type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;
type DailyHistory = Awaited<ReturnType<typeof getDailyHistory>>;
type MonthTotals = Awaited<ReturnType<typeof getMonthTotals>>;
type DayLog = Awaited<ReturnType<typeof getDayLog>>;

export const PUBLIC_SUMMARY_VIEWS = ["dashboard", "daily", "month", "day"] as const;
export type PublicSummaryView = (typeof PUBLIC_SUMMARY_VIEWS)[number];

type PublicSummaryResponseOptions = {
  ownerKey?: string | null;
  /**
   * `dashboard` is the full projection the public page loads. `daily` is the small view for agents.
   * `month` and `day` are the calendar of the public page and the day it opens.
   */
  view?: PublicSummaryView;
  now?: Date;
  /** Read the owner's public view setting. Nothing loads while it is off. */
  loadPublicViewEnabled: (ownerKey: string) => Promise<boolean>;
  loadSummary: (ownerKey: string) => Promise<DashboardSummary>;
  loadDailyHistory: (ownerKey: string) => Promise<DailyHistory>;
  /** Load the month the request asks for. The caller has checked the month. */
  loadMonth: (ownerKey: string) => Promise<MonthTotals>;
  /** Load the day the request asks for. The caller has checked the date. */
  loadDay: (ownerKey: string) => Promise<DayLog>;
};

export class PublicSummaryConfigError extends Error {
  readonly status = 503;
  readonly code = "public_owner_key_missing";

  constructor() {
    super("The public dashboard is not configured.");
    this.name = "PublicSummaryConfigError";
  }
}

/** The answer of the public data routes while the owner keeps the public view off. */
export function publicViewOffResponse(): Response {
  return Response.json(
    { error: { code: "public_view_off", message: "The public dashboard is turned off." } },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

/** The view a `view` query value asks for, or null when the value is not supported. */
export function parsePublicSummaryView(value: string | null): PublicSummaryView | null {
  if (value === null) return "dashboard";
  return PUBLIC_SUMMARY_VIEWS.find((view) => view === value) ?? null;
}

/**
 * Build the anonymous dashboard response from the one explicitly configured
 * owner. The caller must provide the configured key; no anonymous fallback is
 * allowed here. The owner must have turned the public view on.
 */
export async function buildPublicSummaryResponse({
  ownerKey,
  view = "dashboard",
  now = new Date(),
  loadPublicViewEnabled,
  loadSummary,
  loadDailyHistory,
  loadMonth,
  loadDay,
}: PublicSummaryResponseOptions): Promise<Response> {
  const configuredOwnerKey = ownerKey?.trim();
  if (!configuredOwnerKey) {
    throw new PublicSummaryConfigError();
  }
  if (!await loadPublicViewEnabled(configuredOwnerKey)) return publicViewOffResponse();

  const loadBody = {
    dashboard: async () => projectPublicDashboardSummary(await loadSummary(configuredOwnerKey)),
    daily: async () => projectPublicDailyHistory(await loadDailyHistory(configuredOwnerKey)),
    month: async () => projectPublicMonthTotals(await loadMonth(configuredOwnerKey)),
    day: async () => projectPublicDayLog(await loadDay(configuredOwnerKey), now),
  }[view];
  return Response.json(await loadBody(), {
    headers: { "cache-control": "no-store" },
  });
}
