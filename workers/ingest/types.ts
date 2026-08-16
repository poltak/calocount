export interface TelegramWebhookEnvironment {
  readonly TELEGRAM_BOT_TOKEN?: string;
  readonly TELEGRAM_WEBHOOK_SECRET?: string;
  readonly TELEGRAM_ALLOWED_USER_IDS?: string;
  readonly TELEGRAM_ALLOWED_CHAT_IDS?: string;
  readonly TELEGRAM_ALLOWED_USER_ID?: string;
  readonly TELEGRAM_ALLOWED_CHAT_ID?: string;
}

export interface IngestSecrets extends TelegramWebhookEnvironment, AnalyzerFactoryEnvironment {
  readonly TELEGRAM_BOT_TOKEN?: string;
  readonly TELEGRAM_WEBHOOK_SECRET?: string;
  readonly MEDIA_SIGNING_SECRET?: string;
  readonly OWNER_KEY?: string;
  readonly CALOCOUNT_OWNER_KEY?: string;
  readonly MAX_RETRY_ATTEMPTS?: string;
}

/** Cloudflare bindings come from the generated worker-configuration.d.ts. */
export type IngestEnvironment = IngestEnv & IngestSecrets;

export interface QueuePayload {
  readonly jobId: string;
}

export interface AnalyzerFactoryEnvironment {
  readonly AI_BACKEND?: string;
  readonly OPENROUTER_API_KEY?: string;
  readonly OPENROUTER_MODEL?: string;
  readonly OPENROUTER_FALLBACK_MODELS?: string;
  readonly OPENROUTER_ENDPOINT?: string;
  readonly OPENROUTER_HTTP_REFERER?: string;
  readonly OPENROUTER_APP_NAME?: string;
  readonly XAI_API_KEY?: string;
  readonly XAI_MODEL?: string;
  readonly XAI_ENDPOINT?: string;
}

export interface MealAnalysisInput {
  readonly caption: string;
  readonly mediaUrl: string;
  readonly capturedAt: string;
  readonly timezone?: string;
  readonly locale?: string;
}

export type Confidence = "high" | "medium" | "low";

export interface MealItem {
  readonly name: string;
  readonly serving: string;
  readonly grams: number | null;
  readonly calories: number;
  readonly proteinGrams: number;
  readonly carbsGrams: number | null;
  readonly fatGrams: number | null;
  readonly confidence: Confidence;
  readonly assumptions: readonly string[];
}

export interface MealTotals {
  readonly calories: number;
  readonly proteinGrams: number;
  readonly carbsGrams: number | null;
  readonly fatGrams: number | null;
}

export interface MealAnalysisResult {
  readonly summary: string;
  readonly items: readonly MealItem[];
  readonly totals: MealTotals;
  readonly confidence: Confidence;
  readonly assumptions: readonly string[];
  readonly questions: readonly string[];
}

export interface AiUsageTrace {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  readonly costUsd: number | null;
}

export interface AiTrace {
  readonly backend: "openrouter" | "xai";
  readonly requestedModel: string;
  readonly actualModel: string | null;
  readonly upstreamProvider: string | null;
  readonly usage: AiUsageTrace;
  readonly latencyMs: number;
  readonly promptVersion: string;
  readonly schemaVersion: string;
}

export interface MealAnalysisResponse {
  readonly result: MealAnalysisResult;
  readonly trace: AiTrace;
}

export interface MealAnalyzer {
  readonly backend: AiTrace["backend"];
  analyze(input: MealAnalysisInput): Promise<MealAnalysisResponse>;
}

export interface AnalyzerFactoryOptions {
  readonly fetchFn?: typeof fetch;
  readonly profile?: AiProfileConfig;
}

export interface AiProfileConfig {
  readonly adapter: string;
  readonly endpoint: string | null;
  readonly primaryModel: string;
  readonly fallbackModels: readonly string[];
  readonly promptVersion: string;
  readonly schemaVersion: string;
}

export interface OpenRouterAnalyzerOptions extends AnalyzerFactoryOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly fallbackModels: readonly string[];
  readonly endpoint?: string;
  readonly httpReferer?: string;
  readonly appName?: string;
  readonly promptVersion?: string;
  readonly schemaVersion?: string;
}

export interface XaiAnalyzerOptions extends AnalyzerFactoryOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly endpoint?: string;
  readonly promptVersion?: string;
  readonly schemaVersion?: string;
}

export interface JobMessage {
  readonly jobId: string;
}

export interface StoredAnalysisJob {
  readonly id: string;
  readonly mealId: string;
  readonly ownerKey: string;
  readonly state: string;
  readonly attemptCount: number;
  readonly availableAfter: number;
  readonly telegramUpdateId: number;
  readonly telegramUserId: string;
  readonly telegramFileId: string;
  readonly telegramChatId: string;
  readonly caption: string;
  readonly capturedAt: string;
  readonly photoKey: string | null;
  readonly photoMimeType: string | null;
}

export interface TelegramPhotoMessage {
  readonly updateId: number;
  readonly userId: string;
  readonly chatId: string;
  readonly fileId: string;
  readonly caption: string;
  readonly capturedAt: string;
  readonly payloadJson: string;
}
