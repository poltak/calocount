import { Logic } from "@app/common/features/core/logic/logic";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { MealWithItems, PhotoObject } from "../storage/types.js";
import {
  ExternalPhotoError,
  type EntryInput,
  type EntryPatch,
  type ExternalMealRequest,
} from "../types.js";
import {
  buildEntryRows,
  buildItemRows,
  snapshotOf,
  totalsOf,
} from "../utils/entry-rows.js";
import { downloadExternalPhoto } from "../utils/external-photo.js";
import { buildExternalEntryRows } from "../utils/external-entry-rows.js";
import { newId } from "../utils/ids.js";
import { newPhotoKey, type PhotoUpload } from "../utils/meal-photo.js";

type EntriesProps = BackendLogicProps<
  "entries" | "entriesPhotos",
  "clock" | "logger" | "images" | "photoDownload"
> &
  BackendAtomicProps;

/** The photo columns of an entry that a new file replaces. */
interface StoredPhoto {
  photoKey: string;
  photoMimeType: string;
  photoSizeBytes: number;
}

const PHOTO_NOT_FOUND = {
  code: "NOT_FOUND",
  message: "Photo not found.",
} as const;

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
   * that the owner already has is not saved again, so the agent can retry, and
   * its photo is not downloaded again. Each result says whether this call saved
   * the meal. A photo that cannot be downloaded leaves the meal without it and
   * says so in `photoStatus`. Any other photo problem saves nothing.
   */
  async createExternal({
    ownerKey,
    requests,
  }: {
    ownerKey: string;
    requests: ExternalMealRequest[];
  }): Promise<
    Array<{
      created: boolean;
      entry: MealWithItems;
      photoStatus?: "download_failed";
    }>
  > {
    const { storage, services } = this.deps;
    const timestamp = services.clock.now();
    const known = new Set(
      requests.some(({ photo }) => photo)
        ? (
            await storage.entries.listEntriesByRequestIds({
              ownerKey,
              requestIds: requests.map(({ requestId }) => requestId),
            })
          ).map(({ meal }) => meal.externalRequestId)
        : [],
    );
    const stored = new Map<string, StoredPhoto>();
    const downloadFailed = new Set<string>();
    try {
      for (const request of requests) {
        if (!request.photo || known.has(request.requestId)) {
          continue;
        }
        try {
          const photo = await downloadExternalPhoto({
            ref: request.photo,
            photoDownload: services.photoDownload,
            images: services.images,
          });
          stored.set(
            request.requestId,
            await this.storePhoto({
              ownerKey,
              mealId: `meal_external_${request.requestId}`,
              photo,
            }),
          );
        } catch (error) {
          if (
            !(error instanceof ExternalPhotoError) ||
            error.code !== "image_download_failed"
          ) {
            throw error;
          }
          services.logger.warn("An agent's photo could not be downloaded", {
            code: error.code,
            reason: error.message,
            cause: error.cause,
          });
          downloadFailed.add(request.requestId);
        }
      }
      return await this.saveExternal({
        ownerKey,
        requests,
        timestamp,
        stored,
        downloadFailed,
      });
    } catch (error) {
      for (const { photoKey } of stored.values()) {
        await this.discardPhoto(photoKey);
      }
      throw error;
    }
  }

  private async saveExternal({
    ownerKey,
    requests,
    timestamp,
    stored,
    downloadFailed,
  }: {
    ownerKey: string;
    requests: ExternalMealRequest[];
    timestamp: number;
    stored: Map<string, StoredPhoto>;
    downloadFailed: Set<string>;
  }) {
    const { storage, atomic } = this.deps;
    const rows = requests.map((request) => {
      const photo = stored.get(request.requestId);
      return buildExternalEntryRows({
        ownerKey,
        request,
        timestamp,
        ...(photo ? { photo } : {}),
      });
    });
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
    const outcomes = [];
    for (const [index, { requestId }] of requests.entries()) {
      const entry = byRequestId.get(requestId);
      if (!entry) {
        throw new AppError({
          code: "INTERNAL",
          message: "The entry was not saved.",
        });
      }
      const saved = created[index] ?? false;
      const photo = stored.get(requestId);
      if (photo && !saved) {
        // Another call saved the meal first, so this object has no entry.
        await this.discardPhoto(photo.photoKey);
      }
      stored.delete(requestId);
      outcomes.push({
        created: saved,
        entry,
        ...(downloadFailed.has(requestId) && !entry.meal.photoKey
          ? { photoStatus: "download_failed" as const }
          : {}),
      });
    }
    return outcomes;
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
    if (!(await storage.entries.hasPhotoReference({ ownerKey, photoKey }))) {
      throw new AppError(PHOTO_NOT_FOUND);
    }
    return this.readPhotoObject({ photoKey, ifNoneMatch });
  }

  /**
   * The photo of one entry of the owner, as the fields that decide whether a
   * visitor may see it. A caller that serves the photo checks them first, and
   * then reads the object with `readPhotoObject`.
   */
  async photoOfEntry({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): Promise<
    | {
        status: string;
        consumedAt: number;
        photoKey: string | null;
        photoMimeType: string | null;
      }
    | undefined
  > {
    const entry = await this.deps.storage.entries.findEntry({ ownerKey, id });
    return entry?.meal;
  }

  /** The object for a key that the caller has already matched to an entry it may serve. */
  async readPhotoObject({
    photoKey,
    ifNoneMatch,
  }: {
    photoKey: string;
    ifNoneMatch: string | null;
  }): Promise<
    | { type: "notModified"; etag: string }
    | { type: "photo"; object: PhotoObject }
  > {
    const { storage } = this.deps;
    if (ifNoneMatch) {
      // A revalidation that still matches needs only the tag.
      const head = await storage.entriesPhotos.head(photoKey);
      if (!head) {
        throw new AppError(PHOTO_NOT_FOUND);
      }
      if (head.httpEtag === ifNoneMatch) {
        return { type: "notModified", etag: head.httpEtag };
      }
    }
    const object = await storage.entriesPhotos.get(photoKey);
    if (!object) {
      throw new AppError(PHOTO_NOT_FOUND);
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
