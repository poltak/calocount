import type { Selectable } from "kysely";

/**
 * The table comes from the old app (`backend/migrations/0000`), and it keeps
 * its columns. The app has one row for each owner. A flag holds 0 or 1.
 */
interface SettingsTable {
  id: string;
  ownerKey: string;
  timezone: string;
  dailyCalorieTarget: number | null;
  dailyProteinTargetG: number | null;
  proteinGoalMode: string;
  dailyProteinTargetPerKg: number | null;
  nutrientTargetsJson: string | null;
  vitaminB6UsFnbAdultUlEnabled: number;
  vitaminB6UsFnbAdultUlConfirmedAt: number | null;
  usFnbAdultUlEnabled: number;
  usFnbAdultUlConfirmedAt: number | null;
  partnerProfileEnabled: number;
  publicViewEnabled: number;
  activeAiProfileId: string | null;
  photoRetentionDays: number;
  createdAt: number;
  updatedAt: number;
}

export interface SettingsTables {
  settings: SettingsTable;
}

export type SettingsRow = Selectable<SettingsTable>;
