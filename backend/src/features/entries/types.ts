import type { NutrientProvenanceMap } from "@app/common/features/entries/utils/nutrient-provenance";
import type {
  NutrientKey,
  NutrientUpperLimitKey,
} from "@app/common/features/entries/utils/nutrients";

/** One food or drink of an entry, as a caller sends it. */
export type EntryItemInput = {
  id?: string | undefined;
  name: string;
  quantity?: number | undefined;
  unit?: string | undefined;
  calories?: number | undefined;
  proteinG?: number | undefined;
  carbsG?: number | undefined;
  fatG?: number | undefined;
  confidence?: number | null | undefined;
  source?: string | undefined;
  nutrientProvenance?: NutrientProvenanceMap | null | undefined;
} & {
  [Key in NutrientKey | NutrientUpperLimitKey]?: number | null | undefined;
};

/** The values of a new entry. The totals of the entry come from its items. */
export interface EntryInput {
  id?: string | undefined;
  consumedAt?: number | undefined;
  source?: string | undefined;
  caption?: string | undefined;
  mealType?: string | null | undefined;
  status?: string | undefined;
  confidence?: number | null | undefined;
  assumptions?: unknown[] | undefined;
  notes?: string | null | undefined;
  items?: EntryItemInput[] | undefined;
  savedEntryId?: string | null | undefined;
  /** The request ID of the agent that logged the entry, so that a retry finds it. */
  externalRequestId?: string | null | undefined;
  photoKey?: string | null | undefined;
  photoMimeType?: string | null | undefined;
  photoSizeBytes?: number | null | undefined;
}

/** The values of an edit. An item list replaces the items of the entry. */
export interface EntryPatch extends EntryInput {
  /** Why the owner made the edit. The revision records it. */
  reason?: string | undefined;
  /** Who made the edit, as the revision records it. The default is the dashboard. */
  revisionSource?: string | undefined;
}

/** A meal that an agent logs through MCP. The totals are those of its one item. */
export interface ExternalMealRequest {
  /** A UUID that the agent made. The same ID again is a retry. */
  requestId: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  consumedAt: number;
  nutrients?: Partial<
    Record<NutrientKey | NutrientUpperLimitKey, number | null>
  >;
}
