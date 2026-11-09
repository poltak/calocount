import { Logic } from "@app/common/features/core/logic/logic";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { MealWithItems } from "../storage/types.js";
import type { EntryInput, EntryPatch } from "../utils/entry-input.js";
import {
  buildEntryRows,
  buildItemRows,
  snapshotOf,
  totalsOf,
} from "../utils/entry-rows.js";
import { newId } from "../utils/ids.js";

type EntriesProps = BackendLogicProps<"entries", "clock"> & BackendAtomicProps;

const NOT_FOUND = {
  code: "NOT_FOUND",
  message: "Entry not found.",
} as const;

/** The entries of the owner: create, edit, delete, and copy. */
export class EntriesLogic extends Logic<EntriesProps, Record<string, never>> {
  constructor(deps: EntriesProps) {
    super({ deps, initialState: {} });
  }

  async create({
    ownerKey,
    input,
  }: {
    ownerKey: string;
    input: EntryInput;
  }): Promise<MealWithItems> {
    return this.insert({ ownerKey, input });
  }

  /**
   * Change an entry. The totals of an entry always equal the sum of its items,
   * so an edit that gives no items keeps the old items and the totals follow
   * them. The record of the edit holds the entry before and after it.
   */
  async update({
    ownerKey,
    id,
    patch,
  }: {
    ownerKey: string;
    id: string;
    patch: EntryPatch;
  }): Promise<MealWithItems> {
    const { storage, atomic, services } = this.deps;
    const before = await storage.entries.findEntry({ ownerKey, id });
    if (!before) {
      throw new AppError(NOT_FOUND);
    }
    const timestamp = services.clock.now();
    const replacement = patch.items
      ? buildItemRows({ items: patch.items, ownerKey, mealId: id, timestamp })
      : null;
    const items = replacement?.rows ?? before.items;
    const totals = replacement?.totals ?? totalsOf(before.items);
    const changes = {
      consumedAt: patch.consumedAt ?? before.meal.consumedAt,
      source: patch.source ?? before.meal.source,
      caption: patch.caption?.trim() ?? before.meal.caption,
      mealType:
        patch.mealType === undefined ? before.meal.mealType : patch.mealType,
      status: patch.status ?? before.meal.status,
      totalCalories: totals.calories,
      totalProteinG: totals.proteinG,
      totalCarbsG: totals.carbsG,
      totalFatG: totals.fatG,
      confidence:
        patch.confidence === undefined
          ? before.meal.confidence
          : patch.confidence,
      assumptionsJson:
        patch.assumptions === undefined
          ? before.meal.assumptionsJson
          : JSON.stringify(patch.assumptions),
      notes: patch.notes === undefined ? before.meal.notes : patch.notes,
      updatedAt: timestamp,
    };
    await atomic((planning) => [
      planning.entries.planUpdateEntry({ ownerKey, id, changes }),
      ...(replacement
        ? planning.entries.planReplaceItems({
            ownerKey,
            mealId: id,
            items: replacement.rows,
          })
        : []),
      planning.entries.planInsertRevision({
        id: newId("revision"),
        mealId: id,
        ownerKey,
        source: "dashboard",
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify({
          meal: { ...before.meal, ...changes },
          items,
        }),
        reason: patch.reason?.trim() || "edit",
        createdAt: timestamp,
      }),
    ]);
    return this.read({ ownerKey, id });
  }

  /** The guard is in the statement: an entry that is gone deletes no row. */
  async remove({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): Promise<void> {
    const results = await this.deps.atomic((planning) =>
      planning.entries.planDeleteEntry({ ownerKey, id }),
    );
    if (results.at(-1)?.changes === 0) {
      throw new AppError(NOT_FOUND);
    }
  }

  /** Copy an entry with new IDs. The copy keeps the photo of the original. */
  async copy({
    ownerKey,
    id,
    consumedAt,
  }: {
    ownerKey: string;
    id: string;
    consumedAt: number | undefined;
  }): Promise<MealWithItems> {
    const source = await this.deps.storage.entries.findEntry({ ownerKey, id });
    if (!source) {
      throw new AppError(NOT_FOUND);
    }
    return this.insert({
      ownerKey,
      input: {
        ...snapshotOf(source),
        consumedAt: consumedAt ?? this.deps.services.clock.now(),
        source: "dashboard",
        savedEntryId: source.meal.savedEntryId,
        status: source.meal.status,
        photoKey: source.meal.photoKey,
        photoMimeType: source.meal.photoMimeType,
        photoSizeBytes: source.meal.photoSizeBytes,
      },
    });
  }

  private async insert({
    ownerKey,
    input,
  }: {
    ownerKey: string;
    input: EntryInput;
  }): Promise<MealWithItems> {
    const rows = buildEntryRows({
      ownerKey,
      input,
      timestamp: this.deps.services.clock.now(),
    });
    await this.deps.atomic((planning) =>
      planning.entries.planInsertEntry(rows),
    );
    return this.read({ ownerKey, id: rows.meal.id });
  }

  private async read({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): Promise<MealWithItems> {
    const entry = await this.deps.storage.entries.findEntry({ ownerKey, id });
    if (!entry) {
      throw new AppError({
        code: "INTERNAL",
        message: "The entry was not saved.",
      });
    }
    return entry;
  }
}
