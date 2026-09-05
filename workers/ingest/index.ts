import { AnalyzerFactory, AnalyzerRequestError } from "./analyzers";
import { BoundedBodyError, MAX_WEBHOOK_BODY_BYTES, readBoundedJson } from "./http";
import {
  claimAnalysisJob,
  ensureAnalysisJob,
  findStaleAnalysisJobs,
  loadActiveAiProfile,
  loadAnalysisJob,
  markJobFailed,
  markJobRetry,
  recordAiFailure,
  resetStaleAnalysisJob,
  retryLimit,
  saveMealAndTrace,
} from "./jobs";
import {
  createMediaToken,
  isAllowedTelegramUpdate,
  isAuthorizedWebhookRequest,
  verifyMediaToken,
} from "./security";
import { cleanupUnlinkedMealPhotos } from "./photo-cleanup";
import { storeMealPhoto } from "./photos";
import {
  downloadTelegramPhoto,
  parseTelegramMealMessage,
  sendTelegramMealResult,
  sendTelegramSafeError,
  TelegramApiError,
  type TelegramSafeErrorKind,
} from "./telegram";
import type {
  IngestEnvironment,
  JobMessage,
} from "./types";

const WEBHOOK_PATH = "/telegram/webhook";
const MEDIA_PREFIX = "/ai-media/";
const MAX_MEDIA_TOKEN_SECONDS = 300;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function safeErrorCode(error: unknown): string {
  if (error instanceof AnalyzerRequestError) {
    return error.message.slice(0, 80);
  }
  if (error instanceof TelegramApiError) {
    return error.message.slice(0, 80);
  }
  return "ingest_error";
}

export function classifyTelegramFailure(error: unknown): TelegramSafeErrorKind {
  return error instanceof AnalyzerRequestError && error.status === 402 ? "provider" : "photo";
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AnalyzerRequestError || error instanceof TelegramApiError) {
    return error.retryable;
  }
  return true;
}

async function handleWebhook(request: Request, env: IngestEnvironment): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_WEBHOOK_BODY_BYTES) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }
  if (!(await isAuthorizedWebhookRequest(request, env))) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_WEBHOOK_BODY_BYTES);
  } catch (error) {
    if (error instanceof BoundedBodyError) {
      return jsonResponse({ error: "payload_too_large" }, 413);
    }
    // Returning 202 prevents Telegram from repeatedly delivering malformed
    // payloads. The authenticated sender can still retry a real photo update.
    return jsonResponse({ ok: true }, 202);
  }

  const mealMessage = parseTelegramMealMessage(body);
  if (!mealMessage || !isAllowedTelegramUpdate({ fromId: mealMessage.userId, chatId: mealMessage.chatId }, env)) {
    // Do not reveal whether an arbitrary Telegram account or chat exists.
    return jsonResponse({ ok: true }, 202);
  }

  try {
    const ensured = await ensureAnalysisJob(env.DB, mealMessage, configuredOwnerKey(env));
    // A duplicate pending/retry job can be re-enqueued after a transient queue
    // failure. claimAnalysisJob makes duplicate queue deliveries harmless.
    if (ensured.created || ensured.job.state === "pending" || ensured.job.state === "retry") {
      await env.MEAL_QUEUE.send({ jobId: ensured.job.id });
    }
    return jsonResponse({ ok: true }, 202);
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_webhook_error", code: safeErrorCode(error) }));
    return jsonResponse({ error: "temporary_failure" }, 503);
  }
}

function configuredOwnerKey(env: IngestEnvironment): string {
  return env.OWNER_KEY ?? env.CALOCOUNT_OWNER_KEY ?? "default";
}

function decodeToken(pathname: string): string | null {
  if (!pathname.startsWith(MEDIA_PREFIX)) {
    return null;
  }
  const encoded = pathname.slice(MEDIA_PREFIX.length);
  if (!encoded || encoded.includes("/")) {
    return null;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

async function handleSignedMedia(request: Request, env: IngestEnvironment): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  const secret = env.MEDIA_SIGNING_SECRET;
  const token = decodeToken(new URL(request.url).pathname);
  if (!secret || !token) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  const payload = await verifyMediaToken(token, secret);
  if (!payload || !payload.key.startsWith("meals/")) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  const object = await env.MEAL_PHOTOS.get(payload.key);
  if (!object?.body) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
    },
  });
}

function mediaUrl(env: IngestEnvironment, token: string): string {
  const origin = env.PUBLIC_ORIGIN;
  if (!origin) {
    throw new Error("public_origin_not_configured");
  }
  const url = new URL(origin);
  url.pathname = `${url.pathname.replace(/\/$/u, "")}${MEDIA_PREFIX}${encodeURIComponent(token)}`;
  url.search = "";
  return url.toString();
}

interface JobOutcome {
  readonly retry: boolean;
  readonly delaySeconds?: number;
}

async function processJob(jobId: string, env: IngestEnvironment): Promise<JobOutcome> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.MEDIA_SIGNING_SECRET) {
    return { retry: false };
  }

  const claimed = await claimAnalysisJob(env.DB, jobId);
  if (!claimed) {
    return { retry: false };
  }

  const job = await loadAnalysisJob(env.DB, jobId);
  if (!job) {
    return { retry: false };
  }

  try {
    const storedPhoto = await storeMealPhoto({
      db: env.DB,
      bucket: env.MEAL_PHOTOS,
      job,
      download: () => downloadTelegramPhoto(env.TELEGRAM_BOT_TOKEN!, job.telegramFileId),
    });

    const token = await createMediaToken(
      storedPhoto.photoKey,
      env.MEDIA_SIGNING_SECRET,
      Date.now(),
      MAX_MEDIA_TOKEN_SECONDS,
    );
    const activeProfile = await loadActiveAiProfile(env.DB, job.ownerKey);
    const analyzer = AnalyzerFactory.create(env, { profile: activeProfile ?? undefined });
    const analysis = await analyzer.analyze({
      caption: job.caption,
      mediaUrl: mediaUrl(env, token),
      capturedAt: job.capturedAt,
    });

    await saveMealAndTrace(
      env.DB,
      job,
      analysis.result,
      analysis.trace,
      storedPhoto.photoKey,
      storedPhoto.photoMimeType,
    );
    try {
      await sendTelegramMealResult(env.TELEGRAM_BOT_TOKEN, job.telegramChatId, analysis.result);
    } catch (error) {
      console.error(JSON.stringify({ event: "telegram_result_error", code: safeErrorCode(error), jobId: job.id }));
    }
    return { retry: false };
  } catch (error) {
    const errorCode = safeErrorCode(error);
    const shouldRetry = isRetryable(error) && job.attemptCount <= retryLimit(env.MAX_RETRY_ATTEMPTS);
    const delaySeconds = Math.min(300, 10 * 2 ** Math.max(0, job.attemptCount - 1));
    try {
      await recordAiFailure(env.DB, job, null, errorCode);
      if (shouldRetry) {
        await markJobRetry(env.DB, job.id, errorCode, delaySeconds * 1_000);
      } else {
        await markJobFailed(env.DB, job.id, errorCode);
        try {
          await sendTelegramSafeError(env.TELEGRAM_BOT_TOKEN, job.telegramChatId, {
            kind: classifyTelegramFailure(error),
          });
        } catch (sendError) {
          console.error(JSON.stringify({ event: "telegram_error_result_error", code: safeErrorCode(sendError), jobId: job.id }));
        }
      }
    } catch (databaseError) {
      console.error(JSON.stringify({ event: "job_failure_persist_error", code: safeErrorCode(databaseError), jobId: job.id }));
    }
    console.error(JSON.stringify({ event: "meal_job_error", code: errorCode, jobId: job.id }));
    return shouldRetry
      ? { retry: true, delaySeconds }
      : { retry: false };
  }
}

async function handleQueue(batch: MessageBatch<JobMessage>, env: IngestEnvironment): Promise<void> {
  for (const message of batch.messages) {
    try {
      const outcome = await processJob(message.body.jobId, env);
      if (outcome.retry) {
        message.retry({ delaySeconds: outcome.delaySeconds });
      } else {
        message.ack();
      }
    } catch (error) {
      // Keep an unexpected handler error safe and retryable. The queue will
      // apply its configured delivery limit if the binding has one.
      console.error(JSON.stringify({ event: "queue_handler_error", code: safeErrorCode(error) }));
      message.retry({ delaySeconds: 30 });
    }
  }
}

async function handleScheduled(env: IngestEnvironment): Promise<void> {
  const staleJobs = await findStaleAnalysisJobs(env.DB);
  for (const jobId of staleJobs) {
    try {
      await resetStaleAnalysisJob(env.DB, jobId);
      await env.MEAL_QUEUE.send({ jobId });
    } catch (error) {
      console.error(JSON.stringify({ event: "stale_job_requeue_error", code: safeErrorCode(error), jobId }));
    }
  }
  try {
    const cleanup = await cleanupUnlinkedMealPhotos({ bucket: env.MEAL_PHOTOS, db: env.DB });
    console.log(JSON.stringify({ event: "meal_photo_cleanup", ...cleanup }));
  } catch (error) {
    console.error(JSON.stringify({ event: "meal_photo_cleanup_error", code: safeErrorCode(error) }));
  }
}

export const ingestWorker = {
  async fetch(request: Request, env: IngestEnvironment, _ctx: ExecutionContext): Promise<Response> {
    void _ctx;
    const url = new URL(request.url);
    try {
      if (url.pathname === WEBHOOK_PATH) {
        return await handleWebhook(request, env);
      }
      if (url.pathname.startsWith(MEDIA_PREFIX)) {
        return await handleSignedMedia(request, env);
      }
      if (url.pathname === "/healthz" && request.method === "GET") {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ error: "not_found" }, 404);
    } catch (error) {
      console.error(JSON.stringify({ event: "fetch_handler_error", code: safeErrorCode(error) }));
      return jsonResponse({ error: "temporary_failure" }, 503);
    }
  },

  async queue(batch: MessageBatch<JobMessage>, env: IngestEnvironment, _ctx: ExecutionContext): Promise<void> {
    void _ctx;
    await handleQueue(batch, env);
  },

  async scheduled(
    _controller: ScheduledController,
    env: IngestEnvironment,
    _ctx: ExecutionContext,
  ): Promise<void> {
    void _controller;
    void _ctx;
    await handleScheduled(env);
  },
};

export default ingestWorker;
