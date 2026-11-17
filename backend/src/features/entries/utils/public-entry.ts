import {
  NUTRIENT_KEYS,
  NUTRIENT_UPPER_LIMIT_KEYS,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "@app/common/features/entries/utils/nutrients";
import {
  isPublicPhotoMimeType,
  isWithinPublicPhotoWindow,
} from "@app/common/features/entries/utils/public-photo-policy";
import type { BackendLogic } from "../../core/types.js";
import type { MealWithItems } from "../storage/types.js";
import type { readSummary } from "../handlers/dashboard-reads.js";
import type { serialiseEntry } from "./entry-rows.js";

type DailyWeight = NonNullable<
  Awaited<ReturnType<BackendLogic["weights"]["day"]>>
>;
type OwnerEntry = ReturnType<typeof serialiseEntry>;
type OwnerItem = OwnerEntry["items"][number];

/**
 * The public body is a subtype of the owner body. A private field stays in it
 * with a fixed empty value, so the owner's frontend code reads both. The key
 * lists below make a new owner column break the projection until someone
 * decides whether the column is public.
 */
type PrivateEntryKey =
  | "caption"
  | "notes"
  | "assumptions"
  | "confidence"
  | "photoKey"
  | "photoMimeType"
  | "photoSizeBytes"
  | "source"
  | "externalRequestId"
  | "savedEntryId"
  | "createdAt"
  | "updatedAt"
  | "items";

type PrivateItemKey =
  "source" | "confidence" | "createdAt" | "updatedAt" | "nutrientProvenance";

type PublicItem = Omit<OwnerItem, PrivateItemKey> & {
  source: "";
  confidence: null;
  createdAt: 0;
  updatedAt: 0;
};

export type PublicEntry = Omit<OwnerEntry, PrivateEntryKey> & {
  caption: "";
  notes: null;
  assumptions: [];
  confidence: null;
  photoKey: null;
  photoMimeType: null;
  photoSizeBytes: null;
  source: "";
  externalRequestId: null;
  savedEntryId: null;
  createdAt: 0;
  updatedAt: 0;
  items: PublicItem[];
  hasPhoto: boolean;
};

export type PublicWeight = Omit<DailyWeight, "createdAt" | "updatedAt"> & {
  createdAt: 0;
  updatedAt: 0;
};

type TrackedKey = NutrientKey | NutrientUpperLimitKey;

function nutrientsOf(item: Record<TrackedKey, number | null>) {
  const nutrients = {} as Record<TrackedKey, number | null>;
  for (const key of [...NUTRIENT_KEYS, ...NUTRIENT_UPPER_LIMIT_KEYS]) {
    nutrients[key] = item[key];
  }
  return nutrients;
}

export function publicWeightOf(weight: DailyWeight): PublicWeight {
  return {
    id: weight.id,
    logicalDate: weight.logicalDate,
    weightKg: weight.weightKg,
    recordedAt: weight.recordedAt,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** `today` is the date of today in the saved timezone. The photo route serves the entries of the last seven days only. */
export function publicEntryOf({
  entry: { meal, items },
  today,
  timeZone,
}: {
  entry: MealWithItems;
  today: string;
  timeZone: string;
}): PublicEntry {
  return {
    id: meal.id,
    consumedAt: meal.consumedAt,
    mealType: meal.mealType,
    status: meal.status,
    totalCalories: meal.totalCalories,
    totalProteinG: meal.totalProteinG,
    totalCarbsG: meal.totalCarbsG,
    totalFatG: meal.totalFatG,
    caption: "",
    notes: null,
    assumptions: [],
    confidence: null,
    photoKey: null,
    photoMimeType: null,
    photoSizeBytes: null,
    source: "",
    externalRequestId: null,
    savedEntryId: null,
    createdAt: 0,
    updatedAt: 0,
    hasPhoto:
      Boolean(meal.photoKey) &&
      isPublicPhotoMimeType(meal.photoMimeType) &&
      isWithinPublicPhotoWindow({
        consumedAt: meal.consumedAt,
        summaryDate: today,
        timeZone,
      }),
    items: items.map((item) => ({
      id: item.id,
      mealId: item.mealId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      ...nutrientsOf(item),
      source: "",
      confidence: null,
      createdAt: 0,
      updatedAt: 0,
    })),
  };
}

type SummaryRead = Awaited<ReturnType<typeof readSummary>>;

/** The weights go through `publicWeightOf`. The owner's profile and the partner switch are fixed values. */
export function publicSummaryOf(read: SummaryRead) {
  return {
    date: read.date,
    timezone: read.timezone,
    profile: "owner" as const,
    partnerProfileEnabled: false as const,
    targets: read.targets,
    days: read.days,
    averageCalories: read.averageCalories,
    recentWeights: read.recentWeights.map(publicWeightOf),
    trend: {
      days: read.trend.days,
      weights: read.trend.weights.map(publicWeightOf),
      proteinTargets: read.trend.proteinTargets,
    },
    history: {
      days: read.history.days,
      weights: read.history.weights.map(publicWeightOf),
    },
  };
}
