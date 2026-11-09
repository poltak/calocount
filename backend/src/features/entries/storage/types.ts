import type { Selectable } from "kysely";
import type {
  NutrientKey,
  NutrientUpperLimitKey,
} from "@app/common/features/entries/utils/nutrients";

/**
 * These tables come from the old app (`backend/migrations/0000` and later),
 * and they keep its columns, so the owner's entries keep working. Every row
 * carries `ownerKey`, the key of the owner's data. The app calls a meal row an
 * entry.
 */

interface MealLogTable {
  id: string;
  ownerKey: string;
  consumedAt: number;
  source: string;
  caption: string;
  mealType: string | null;
  status: string;
  photoKey: string | null;
  photoMimeType: string | null;
  photoSizeBytes: number | null;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  confidence: number | null;
  /** A JSON list. */
  assumptionsJson: string;
  notes: string | null;
  externalRequestId: string | null;
  savedEntryId: string | null;
  createdAt: number;
  updatedAt: number;
}

type MealItemNutrients = Record<
  NutrientKey | NutrientUpperLimitKey,
  number | null
>;

interface MealItemTable extends MealItemNutrients {
  id: string;
  mealId: string;
  ownerKey: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** A JSON map from a nutrient key to its origin. */
  nutrientProvenanceJson: string | null;
  confidence: number | null;
  source: string;
  createdAt: number;
  updatedAt: number;
}

/** The record of an edit, with the entry before and after it as JSON. */
interface MealRevisionTable {
  id: string;
  mealId: string;
  ownerKey: string;
  source: string;
  beforeJson: string;
  afterJson: string;
  reason: string;
  createdAt: number;
}

/** A reusable copy of an entry. The snapshot is JSON, so a later edit of the entry does not change it. */
interface SavedEntryTable {
  id: string;
  ownerKey: string;
  sourceMealId: string;
  snapshotJson: string;
  createdAt: number;
  updatedAt: number;
}

/** Only the columns that the delete of an entry reads. Later phases that use the rest add them. */
interface AnalysisJobTable {
  id: string;
  mealId: string;
  ownerKey: string;
}

interface AiRunTable {
  id: string;
  mealId: string | null;
  ownerKey: string;
}

export interface EntriesTables {
  mealLogs: MealLogTable;
  mealItems: MealItemTable;
  mealRevisions: MealRevisionTable;
  savedEntries: SavedEntryTable;
  analysisJobs: AnalysisJobTable;
  aiRuns: AiRunTable;
}

type MealLogRow = Selectable<MealLogTable>;
export type MealItemRow = Selectable<MealItemTable>;
export type SavedEntryRow = Selectable<SavedEntryTable>;
export type NewMealLog = MealLogTable;
export type NewMealItem = MealItemTable;
export type NewMealRevision = MealRevisionTable;

/** An entry with its items. */
export interface MealWithItems {
  meal: MealLogRow;
  items: MealItemRow[];
}
