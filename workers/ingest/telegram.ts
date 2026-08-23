import { normalizeTelegramId } from "./security";
import { MAX_TELEGRAM_RESPONSE_BYTES, readBoundedJson } from "./http";
import type { MealAnalysisResult, TelegramPhotoMessage } from "./types";

const TELEGRAM_API_ROOT = "https://api.telegram.org";

export class TelegramApiError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "TelegramApiError";
    this.retryable = retryable;
  }
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function selectLargestPhoto(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const fileIds = value.flatMap((photo) => {
    const record = recordOf(photo);
    const fileId = stringValue(record?.file_id);
    return fileId ? [fileId] : [];
  });
  return fileIds.length > 0 ? fileIds[fileIds.length - 1] : null;
}

/** Extract only a supported photo message from an untrusted Telegram update. */
export function parseTelegramMealMessage(update: unknown): TelegramPhotoMessage | null {
  const root = recordOf(update);
  const updateId = numberValue(root?.update_id);
  const message = recordOf(root?.message);
  const from = recordOf(message?.from);
  const chat = recordOf(message?.chat);
  const userId = normalizeTelegramId(from?.id);
  const chatId = normalizeTelegramId(chat?.id);
  const fileId = selectLargestPhoto(message?.photo);
  const messageDate = numberValue(message?.date);

  if (!updateId || !userId || !chatId || !fileId || !messageDate) {
    return null;
  }

  const captionValue = message?.caption;
  if (captionValue !== undefined && typeof captionValue !== "string") {
    return null;
  }
  const caption = typeof captionValue === "string" ? captionValue.trim().slice(0, 4000) : "";
  const capturedAt = new Date(messageDate * 1000);
  if (!Number.isFinite(capturedAt.getTime())) {
    return null;
  }

  let payloadJson: string;
  try {
    payloadJson = JSON.stringify(update);
  } catch {
    return null;
  }
  if (payloadJson.length === 0) {
    return null;
  }

  return {
    updateId,
    userId,
    chatId,
    fileId,
    caption,
    capturedAt: capturedAt.toISOString(),
    payloadJson,
  };
}

interface TelegramFileResult {
  readonly filePath: string;
}

async function telegramJson(
  token: string,
  method: string,
  init: RequestInit,
  fetchFn: typeof fetch,
): Promise<unknown> {
  const response = await fetchFn(`${TELEGRAM_API_ROOT}/bot${encodeURIComponent(token)}/${method}`, init);
  let body: unknown;
  try {
    body = await readBoundedJson(response, MAX_TELEGRAM_RESPONSE_BYTES);
  } catch {
    throw new TelegramApiError("telegram_invalid_response", response.status >= 500);
  }

  if (!response.ok) {
    throw new TelegramApiError(`telegram_http_${response.status}`, response.status >= 500 || response.status === 429);
  }

  const root = recordOf(body);
  if (root?.ok !== true) {
    throw new TelegramApiError("telegram_api_error", true);
  }
  return root.result;
}

async function getTelegramFilePath(
  token: string,
  fileId: string,
  fetchFn: typeof fetch,
): Promise<TelegramFileResult> {
  const query = `?file_id=${encodeURIComponent(fileId)}`;
  const result = await telegramJson(token, `getFile${query}`, { method: "GET" }, fetchFn);
  const filePath = stringValue(recordOf(result)?.file_path);
  if (!filePath || filePath.length > 512 || filePath.includes("..")) {
    throw new TelegramApiError("telegram_invalid_file_path", false);
  }
  return { filePath };
}

export interface TelegramPhotoStream {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string;
}

const MAX_IMAGE_SIGNATURE_BYTES = 12;

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.byteLength < signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[index] === byte);
}

function detectImageContentType(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWithBytes(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  return null;
}

/** Inspect only the image signature while returning the untouched output stream. */
async function detectStreamImageContentType(
  body: ReadableStream<Uint8Array>,
): Promise<{ readonly body: ReadableStream<Uint8Array>; readonly contentType: string } | null> {
  const [inspectionBody, outputBody] = body.tee();
  const reader = inspectionBody.getReader();
  const signature = new Uint8Array(MAX_IMAGE_SIGNATURE_BYTES);
  let signatureLength = 0;

  try {
    while (signatureLength < MAX_IMAGE_SIGNATURE_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }
      const bytesToCopy = Math.min(value.byteLength, MAX_IMAGE_SIGNATURE_BYTES - signatureLength);
      signature.set(value.subarray(0, bytesToCopy), signatureLength);
      signatureLength += bytesToCopy;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  const contentType = detectImageContentType(signature.subarray(0, signatureLength));
  if (!contentType) {
    await outputBody.cancel().catch(() => undefined);
    return null;
  }
  return { body: outputBody, contentType };
}

/** Download the photo as a stream so it can be written to R2 without buffering. */
export async function downloadTelegramPhoto(
  token: string,
  fileId: string,
  fetchFn: typeof fetch = fetch,
): Promise<TelegramPhotoStream> {
  const { filePath } = await getTelegramFilePath(token, fileId, fetchFn);
  const encodedPath = filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const response = await fetchFn(
    `${TELEGRAM_API_ROOT}/file/bot${encodeURIComponent(token)}/${encodedPath}`,
    { method: "GET" },
  );
  if (!response.ok || !response.body) {
    throw new TelegramApiError(`telegram_photo_http_${response.status}`, response.status >= 500 || response.status === 429);
  }
  const contentType = response.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mediaType.startsWith("image/")) {
    return { body: response.body, contentType: contentType ?? mediaType };
  }
  if (mediaType !== "" && mediaType !== "application/octet-stream") {
    throw new TelegramApiError("telegram_photo_not_an_image", false);
  }
  const detected = await detectStreamImageContentType(response.body);
  if (!detected) {
    throw new TelegramApiError("telegram_photo_not_an_image", false);
  }
  return detected;
}

export async function sendTelegramMealResult(
  token: string,
  chatId: string,
  result: MealAnalysisResult,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const lines = [
    `Estimated: ${Math.round(result.totals.calories)} kcal`,
    `Protein: ${Math.round(result.totals.proteinGrams)} g`,
    result.totals.carbsGrams === null ? null : `Carbs: ${Math.round(result.totals.carbsGrams)} g`,
    result.totals.fatGrams === null ? null : `Fat: ${Math.round(result.totals.fatGrams)} g`,
    `Confidence: ${result.confidence}`,
    result.questions.length > 0 ? `Question: ${result.questions[0]}` : null,
  ].filter((line): line is string => line !== null);
  await telegramJson(
    token,
    "sendMessage",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        disable_web_page_preview: true,
      }),
    },
    fetchFn,
  );
}

export async function sendTelegramSafeError(
  token: string,
  chatId: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  await telegramJson(
    token,
    "sendMessage",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "I could not estimate this meal. Please try the photo again.",
        disable_web_page_preview: true,
      }),
    },
    fetchFn,
  );
}
