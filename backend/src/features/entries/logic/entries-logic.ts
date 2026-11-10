import { Logic } from "@app/common/features/core/logic/logic";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { MealWithItems, PhotoObject } from "../storage/types.js";
import type { EntryInput, EntryPatch, ExternalMealRequest } from "../types.js";
import {
  buildEntryRows,
  buildItemRows,
  snapshotOf,
  totalsOf,
} from "../utils/entry-rows.js";
import { buildExternalEntryRows } from "../utils/external-entry-rows.js";
import { newId } from "../utils/ids.js";
import { newPhotoKey, type PhotoUpload } from "../utils/meal-photo.js";

type EntriesProps = BackendLogicProps<
  "entries" | "entriesPhotos",
  "clock" | "logger"
> &
  BackendAtomicProps;

/** The photo columns of an entry that a new file replaces. */
interface StoredPhoto {
  photoKey: string;
  photoMimeType: string;
  photoSizeBytes: number;
}

const NOT_FOUND = {
  code: "NOT_FOUND",
  message: "Entry not found.",
} as const;

/** The entries of the owner: create, edit, delete, and copy. */
export class EntriesLogic extends Logic<EntriesProps, Record<string, never>> {
  constructor(deps: EntriesProps) {
    super({ deps, initialState: {} });
  }

  /**
   * The photo goes into the bucket before the entry is saved, because the
   * entry points at its key. When the save fails, the new object goes again.
   */
  async create({
    ownerKey,
    input,
    photo,
  }: {
    ownerKey: string;
    input: EntryInput;
    photo: PhotoUpload | null;
  }): Promise<MealWithItems> {
    if (!photo) {
      return this.insert({ ownerKey, input });
    }
    const stored = await this.storePhoto({ ownerKey, photo });
    try {
      return await this.insert({ ownerKey, input: { ...input, ...stored } });
    } catch (error) {
      await this.discardPhoto(stored.photoKey);
      throw error;
    }
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
    photo,
  }: {
    ownerKey: string;
    id: string;
    patch: EntryPatch;
    photo: PhotoUpload | null;
  }): Promise<{ entry: MealWithItems; photoDeleted: boolean | undefined }> {
    const before = await this.deps.storage.entries.findEntry({ ownerKey, id });
    if (!before) {
      // Checked before the upload, so that no object is left for an entry that is not there.
      throw new AppError(NOT_FOUND);
    }
    if (!photo) {
      return {
        entry: await this.saveUpdate({
          ownerKey,
          id,
          patch,
          before,
          stored: null,
        }),
        photoDeleted: undefined,
      };
    }
    const stored = await this.storePhoto({ ownerKey, mealId: id, photo });
    let entry: MealWithItems;
    try {
      entry = await this.saveUpdate({ ownerKey, id, patch, before, stored });
    } catch (error) {
      await this.discardPhoto(stored.photoKey);
      throw error;
    }
    // A copy of the entry may still use the old photo.
    const previous = before.meal.photoKey;
    const photoDeleted =
      previous && previous !== stored.photoKey
        ? await this.deleteUnlinkedPhoto({ ownerKey, photoKey: previous })
        : undefined;
    return { entry, photoDeleted };
  }

  private async saveUpdate({
    ownerKey,
    id,
    patch,
    before,
    stored,
  }: {
    ownerKey: string;
    id: string;
    patch: EntryPatch;
    before: MealWithItems;
    stored: StoredPhoto | null;
  }): Promise<MealWithItems> {
    const { atomic, services } = this.deps;
    const timestamp = services.clock.now();
    const revisionSource = patch.revisionSource ?? "dashboard";
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
      ...stored,
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
        source: revisionSource,
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify({
          meal: { ...before.meal, ...changes },
          items,
        }),
        reason:
          patch.reason?.trim() ||
          (revisionSource === "dashboard" ? "edit" : "correction"),
        createdAt: timestamp,
      }),
    ]);
    return this.read({ ownerKey, id });
  }

  async findByRequestId({
    ownerKey,
    requestId,
  }: {
    ownerKey: string;
    requestId: string;
  }): Promise<MealWithItems | undefined> {
    return this.deps.storage.entries.findEntryByRequestId({
      ownerKey,
      requestId,
    });
  }

  /**
   * Save the meals that an agent logs, in one batch. A meal with a request ID
   * that the owner already has is not saved again, so the agent can retry.
   * Each result says whether this call saved the meal.
   */
  async createExternal({
    ownerKey,
    requests,
  }: {
    ownerKey: string;
    requests: ExternalMealRequest[];
  }): Promise<Array<{ created: boolean; entry: MealWithItems }>> {
    const { storage, atomic, services } = this.deps;
    const timestamp = services.clock.now();
    const rows = requests.map((request) =>
      buildExternalEntryRows({ ownerKey, request, timestamp }),
    );
    const results = await atomic((planning) =>
      rows.flatMap((row) => planning.entries.planInsertExternalEntry(row)),
    );
    let position = 0;
    const created = rows.map(({ items }) => {
      const saved = results[position]?.changes === 1;
      position += 1 + items.length;
      return saved;
    });
    const entries = await storage.entries.listEntriesByRequestIds({
      ownerKey,
      requestIds: requests.map(({ requestId }) => requestId),
    });
    const byRequestId = new Map(
      entries.map((entry) => [entry.meal.externalRequestId, entry]),
    );
    return requests.map(({ requestId }, index) => {
      const entry = byRequestId.get(requestId);
      if (!entry) {
        throw new AppError({
          code: "INTERNAL",
          message: "The entry was not saved.",
        });
      }
      return { created: created[index] ?? false, entry };
    });
  }

  /**
   * The guard is in the statement: an entry that is gone deletes no row. The
   * photo object goes after the row, and only when no other entry uses it. A
   * failed delete leaves an object that the scheduled cleanup removes.
   */
  async remove({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): Promise<{ photoDeleted: boolean }> {
    const entry = await this.deps.storage.entries.findEntry({ ownerKey, id });
    const results = await this.deps.atomic((planning) =>
      planning.entries.planDeleteEntry({ ownerKey, id }),
    );
    if (!entry || results.at(-1)?.changes === 0) {
      throw new AppError(NOT_FOUND);
    }
    const { photoKey } = entry.meal;
    const photoDeleted = photoKey
      ? await this.deleteUnlinkedPhoto({ ownerKey, photoKey })
      : true;
    return { photoDeleted };
  }

  /**
   * The photo of an entry of the owner. A key that no entry of the owner uses
   * is not found, so a key of another owner gives nothing. A matching
   * `ifNoneMatch` gives only the tag.
   */
  async readPhoto({
    ownerKey,
    photoKey,
    ifNoneMatch,
  }: {
    ownerKey: string;
    photoKey: string;
    ifNoneMatch: string | null;
  }): Promise<
    | { type: "notModified"; etag: string }
    | { type: "photo"; object: PhotoObject }
  > {
    const { storage } = this.deps;
    const notFound = new AppError({
      code: "NOT_FOUND",
      message: "Photo not found.",
    });
    if (!(await storage.entries.hasPhotoReference({ ownerKey, photoKey }))) {
      throw notFound;
    }
    if (ifNoneMatch) {
      // A revalidation that still matches needs only the tag.
      const head = await storage.entriesPhotos.head(photoKey);
      if (!head) {
        throw notFound;
      }
      if (head.httpEtag === ifNoneMatch) {
        return { type: "notModified", etag: head.httpEtag };
      }
    }
    const object = await storage.entriesPhotos.get(photoKey);
    if (!object) {
      throw notFound;
    }
    return { type: "photo", object };
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

  private async storePhoto({
    ownerKey,
    mealId,
    photo,
  }: {
    ownerKey: string;
    mealId?: string;
    photo: PhotoUpload;
  }): Promise<StoredPhoto> {
    const photoKey = newPhotoKey({ ownerKey, mealId });
    const { size } = await this.deps.storage.entriesPhotos.put({
      key: photoKey,
      bytes: photo.bytes,
      contentType: photo.contentType,
    });
    return {
      photoKey,
      photoMimeType: photo.contentType,
      photoSizeBytes: size ?? photo.sizeBytes,
    };
  }

  /** Remove an object that no entry points at. A failure must not hide the error that came first. */
  private async discardPhoto(photoKey: string): Promise<void> {
    try {
      await this.deps.storage.entriesPhotos.delete(photoKey);
    } catch (error) {
      this.deps.services.logger.warn("A new photo could not be removed", {
        photoKey,
        error,
      });
    }
  }

  /** True when the object is gone or still in use by another entry. False when the bucket failed. */
  private async deleteUnlinkedPhoto({
    ownerKey,
    photoKey,
  }: {
    ownerKey: string;
    photoKey: string;
  }): Promise<boolean> {
    const { storage, services } = this.deps;
    if (await storage.entries.hasPhotoReference({ ownerKey, photoKey })) {
      return true;
    }
    try {
      await storage.entriesPhotos.delete(photoKey);
      return true;
    } catch (error) {
      services.logger.error("A photo could not be removed", {
        photoKey,
        error,
      });
      return false;
    }
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
