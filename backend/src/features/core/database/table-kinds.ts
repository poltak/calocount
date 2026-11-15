/**
 * The columns of a new table. A client makes the ID, so that a save can repeat
 * with the same ID, and each time is a whole number of milliseconds since the
 * Unix epoch. `Database` does not compile when a table has neither this kind
 * nor a line in `ADOPTED_TABLES`, and a test checks the real columns.
 */
export interface BaseTable {
  id: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * The tables of the old app. Production data holds them, and D1 tracks a
 * migration by its name, so they keep their own columns: `backend/migrations`
 * holds the SQL of the old app under its old names. Do not add a new table
 * here. Give it the columns of `BaseTable`, in a migration from `0017` up.
 */
export const ADOPTED_TABLES = [
  "aiProfiles",
  "aiRuns",
  "analysisJobs",
  "authAttempts",
  "authChallenges",
  "authSessions",
  "dailyWeights",
  "goalChanges",
  "mealItems",
  "mealLogs",
  "mealRevisions",
  "oauthClients",
  "oauthCodes",
  "oauthGrants",
  "oauthTokens",
  "passkeys",
  "savedEntries",
  "settings",
  "shareLinks",
] as const;

export type AdoptedTable = (typeof ADOPTED_TABLES)[number];
