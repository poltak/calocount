import {
  MAX_MEAL_PHOTO_BYTES,
  MEAL_PHOTO_TYPES,
} from "@app/common/features/entries/utils/meal-photo";
import type {
  ImagesServiceInterface,
  PhotoDownloadServiceInterface,
} from "../../core/services/types.js";
import {
  ExternalPhotoError,
  externalPhotoType,
  type ExternalPhotoRef,
} from "../types.js";
import {
  detectType,
  readBoundedBytes,
  type PhotoUpload,
} from "./meal-photo.js";

function conversionFailed(
  message = "The HEIC photo could not be converted. Try a JPEG, PNG, or WebP copy.",
) {
  return new ExternalPhotoError("image_conversion_failed", message);
}

function downloadFailure(
  message = "The image could not be downloaded.",
  cause?: unknown,
) {
  return new ExternalPhotoError("image_download_failed", message, cause);
}

function validatePhoto(
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
): PhotoUpload {
  if (bytes.byteLength === 0) {
    throw new ExternalPhotoError("invalid_photo", "The photo is empty.");
  }
  if (bytes.byteLength > MAX_MEAL_PHOTO_BYTES) {
    throw new ExternalPhotoError(
      "payload_too_large",
      "The photo is too large.",
    );
  }
  if (!MEAL_PHOTO_TYPES.includes(contentType)) {
    throw new ExternalPhotoError(
      "unsupported_photo_type",
      "The photo must be a JPEG, PNG, or WebP image.",
    );
  }
  if (detectType(bytes.subarray(0, 12)) !== contentType) {
    throw new ExternalPhotoError(
      "unsupported_photo_type",
      "The photo content does not match its image type.",
    );
  }
  return { bytes: bytes.buffer, contentType, sizeBytes: bytes.byteLength };
}

/** A length header is a claim. A bad one is refused, and the bytes read are the proof. */
function declaredLength({
  response,
  code,
  message,
}: {
  response: Response;
  code: string;
  message: string;
}): number | null {
  const value = response.headers.get("content-length");
  if (value === null) {
    return null;
  }
  const text = value.trim();
  if (!/^\d+$/u.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new ExternalPhotoError(code, message);
  }
  return Number(text);
}

async function convertHeic({
  bytes,
  images,
}: {
  bytes: Uint8Array;
  images: ImagesServiceInterface;
}): Promise<PhotoUpload> {
  if (!images.available) {
    throw new ExternalPhotoError(
      "image_conversion_unavailable",
      "HEIC photo conversion is not configured.",
    );
  }
  let response: Response;
  try {
    response = await images.convertHeicToJpeg(bytes);
  } catch {
    throw conversionFailed();
  }
  if (!response.ok) {
    throw conversionFailed();
  }
  if (
    externalPhotoType(response.headers.get("content-type")) !== "image/jpeg"
  ) {
    throw conversionFailed("The converted photo type is invalid.");
  }
  const length = declaredLength({
    response,
    code: "image_conversion_failed",
    message: "The converted photo size is invalid.",
  });
  if (length !== null && length > MAX_MEAL_PHOTO_BYTES) {
    throw new ExternalPhotoError(
      "payload_too_large",
      "The converted photo is too large.",
    );
  }
  if (!response.body) {
    throw conversionFailed("The converted photo has no body.");
  }
  let output: Uint8Array<ArrayBuffer> | null;
  try {
    output = await readBoundedBytes({
      stream: response.body,
      maxBytes: MAX_MEAL_PHOTO_BYTES,
    });
  } catch {
    throw conversionFailed("The converted photo could not be read.");
  }
  if (output === null) {
    throw new ExternalPhotoError(
      "payload_too_large",
      "The converted photo is too large.",
    );
  }
  if (length !== null && length !== output.byteLength) {
    throw conversionFailed("The converted photo size is invalid.");
  }
  return validatePhoto(output, "image/jpeg");
}

/**
 * Download the photo of an agent and make it ready for the bucket. A HEIC
 * photo becomes a JPEG. The download link is the agent's, so every length and
 * type is checked against the bytes that arrive.
 */
export async function downloadExternalPhoto({
  ref,
  photoDownload,
  images,
}: {
  ref: ExternalPhotoRef;
  photoDownload: PhotoDownloadServiceInterface;
  images: ImagesServiceInterface;
}): Promise<PhotoUpload> {
  let response: Response;
  try {
    response = await photoDownload.download(ref.downloadUrl);
  } catch (cause) {
    throw downloadFailure("The image could not be downloaded.", cause);
  }
  if (!response.ok) {
    throw downloadFailure(`The image host answered ${response.status}.`);
  }
  const type = externalPhotoType(response.headers.get("content-type"));
  if (!type || (ref.declaredType && type !== ref.declaredType)) {
    throw new ExternalPhotoError(
      "invalid_image",
      "The downloaded image type is invalid.",
    );
  }
  const length = declaredLength({
    response,
    code: "image_download_failed",
    message: "The image response size is invalid.",
  });
  if (length !== null && length > MAX_MEAL_PHOTO_BYTES) {
    throw new ExternalPhotoError(
      "payload_too_large",
      "The image is too large.",
    );
  }
  if (!response.body) {
    throw downloadFailure("The image response has no body.");
  }
  let bytes: Uint8Array<ArrayBuffer> | null;
  try {
    bytes = await readBoundedBytes({
      stream: response.body,
      maxBytes: MAX_MEAL_PHOTO_BYTES,
    });
  } catch {
    throw downloadFailure("The image could not be read.");
  }
  if (bytes === null) {
    throw new ExternalPhotoError(
      "payload_too_large",
      "The image is too large.",
    );
  }
  if (length !== null && length !== bytes.byteLength) {
    throw downloadFailure("The image response size is invalid.");
  }
  return type === "image/heic"
    ? convertHeic({ bytes, images })
    : validatePhoto(bytes, type);
}
