import {
  createAiProfile,
  getAiProfile,
  listAiProfiles,
  updateAiProfile,
  type AiProfileInput,
} from "../../../db/repository";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  optionalNumber,
  parseJsonBody,
  requireApiIdentity,
  requireString,
  withApiErrors,
} from "../_lib/http";

const ADAPTERS = ["openrouter", "xai"] as const;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const CAPABILITIES = new Set(["image", "text", "structured_outputs"]);
const DATA_COLLECTION_POLICIES = new Set(["deny", "allow", "allow_without_logging"]);
const FORBIDDEN_SECRET_FIELDS = new Set([
  "apiKey",
  "api_key",
  "openrouterApiKey",
  "xaiApiKey",
  "accessToken",
  "token",
  "secret",
]);

type ParsedProfile = Partial<AiProfileInput> & { id?: string };

function rejectSecrets(body: Record<string, unknown>): void {
  const field = Object.keys(body).find((key) => {
    const normalised = key.toLowerCase().replaceAll("_", "").replaceAll("-", "");
    return FORBIDDEN_SECRET_FIELDS.has(key) || normalised.includes("apikey") || normalised.includes("token") || normalised.includes("secret");
  });
  if (field) throw new ApiError(400, "api_key_not_allowed", `${field} must be stored as a Worker secret.`);
}

function parseAdapter(value: unknown, required = false): string | undefined {
  if (value == null) {
    if (required) throw new ApiError(400, "invalid_field", "adapter is required.");
    return undefined;
  }
  const adapter = requireString(value, "adapter", { max: 30 });
  if (!adapter || !ADAPTERS.includes(adapter as (typeof ADAPTERS)[number])) {
    throw new ApiError(400, "invalid_field", "adapter must be openrouter or xai.");
  }
  return adapter;
}

function parseModel(value: unknown, field: string, required = false): string | undefined {
  if (value == null) {
    if (required) throw new ApiError(400, "invalid_field", `${field} is required.`);
    return undefined;
  }
  const model = requireString(value, field, { max: 200 });
  if (!model || !MODEL_PATTERN.test(model)) {
    throw new ApiError(400, "invalid_field", `${field} has an invalid model name.`);
  }
  return model;
}

function parseEndpoint(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const endpoint = requireString(value, "endpoint", { max: 500 });
  if (!endpoint) return null;
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new ApiError(400, "invalid_field", "endpoint must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || !["openrouter.ai", "api.x.ai"].includes(parsed.hostname)) {
    throw new ApiError(400, "invalid_field", "endpoint must use an approved AI provider host.");
  }
  return parsed.toString();
}

function parseModels(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) {
    throw new ApiError(400, "invalid_field", "fallbackModels must contain at most eight models.");
  }
  const models = value.map((entry, index) => parseModel(entry, `fallbackModels[${index}]`, true) as string);
  return [...new Set(models)];
}

function parseCapabilities(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 10 || value.some((entry) => typeof entry !== "string" || !CAPABILITIES.has(entry))) {
    throw new ApiError(400, "invalid_field", "requiredCapabilities contains an unsupported value.");
  }
  return [...new Set(value as string[])];
}

function parsePrivacyPolicy(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_field", "privacyPolicy must be an object.");
  }
  const policy = value as Record<string, unknown>;
  const keys = Object.keys(policy);
  if (keys.some((key) => key !== "zdr" && key !== "data_collection")) {
    throw new ApiError(400, "invalid_field", "privacyPolicy contains an unsupported value.");
  }
  if (policy.zdr !== undefined && typeof policy.zdr !== "boolean") {
    throw new ApiError(400, "invalid_field", "privacyPolicy.zdr must be a boolean.");
  }
  if (policy.data_collection !== undefined && (typeof policy.data_collection !== "string" || !DATA_COLLECTION_POLICIES.has(policy.data_collection))) {
    throw new ApiError(400, "invalid_field", "privacyPolicy.data_collection is not valid.");
  }
  return policy;
}

function parseProfile(body: Record<string, unknown>, partial: boolean): ParsedProfile {
  rejectSecrets(body);
  const profile: ParsedProfile = {};
  if (body.id !== undefined) profile.id = requireString(body.id, "id", { max: 120 });
  const adapter = parseAdapter(body.adapter);
  if (adapter !== undefined) {
    profile.adapter = adapter;
  } else if (!partial) {
    profile.adapter = "openrouter";
  }
  const primaryModel = parseModel(body.primaryModel, "primaryModel", !partial);
  if (primaryModel !== undefined) profile.primaryModel = primaryModel;
  const endpoint = parseEndpoint(body.endpoint);
  if (endpoint !== undefined) profile.endpoint = endpoint;
  const fallbackModels = parseModels(body.fallbackModels);
  if (fallbackModels !== undefined) profile.fallbackModels = fallbackModels;
  const requiredCapabilities = parseCapabilities(body.requiredCapabilities);
  if (requiredCapabilities !== undefined) profile.requiredCapabilities = requiredCapabilities;
  const privacyPolicy = parsePrivacyPolicy(body.privacyPolicy);
  if (privacyPolicy !== undefined) profile.privacyPolicy = privacyPolicy;
  if (body.maxInputPrice !== undefined) profile.maxInputPrice = body.maxInputPrice == null ? null : optionalNumber(body.maxInputPrice, "maxInputPrice", { min: 0, max: 100 }) ?? null;
  if (body.maxOutputPrice !== undefined) profile.maxOutputPrice = body.maxOutputPrice == null ? null : optionalNumber(body.maxOutputPrice, "maxOutputPrice", { min: 0, max: 100 }) ?? null;
  if (body.promptVersion !== undefined) profile.promptVersion = requireString(body.promptVersion, "promptVersion", { max: 100 });
  if (body.schemaVersion !== undefined) profile.schemaVersion = requireString(body.schemaVersion, "schemaVersion", { max: 100 });
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") throw new ApiError(400, "invalid_field", "enabled must be a boolean.");
    profile.enabled = body.enabled;
  }
  return profile;
}

function parseStoredJson(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function publicProfile(profile: Awaited<ReturnType<typeof getAiProfile>>) {
  if (!profile) return null;
  const {
    ownerKey: _ownerKey,
    fallbackModelsJson,
    requiredCapabilitiesJson,
    privacyPolicyJson,
    ...value
  } = profile;
  void _ownerKey;
  return {
    ...value,
    fallbackModels: parseStoredJson(fallbackModelsJson, []),
    requiredCapabilities: parseStoredJson(requiredCapabilitiesJson, []),
    privacyPolicy: parseStoredJson(privacyPolicyJson, {}),
  };
}

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const profiles = await listAiProfiles(getRequestDb(), identity.ownerKey);
    return jsonResponse({ profiles: profiles.map((profile) => publicProfile(profile)) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const parsed = parseProfile(await parseJsonBody(request), false);
    const input: AiProfileInput = { ...parsed, primaryModel: parsed.primaryModel ?? "" };
    const profile = await createAiProfile(getRequestDb(), identity.ownerKey, input);
    return jsonResponse({ profile: publicProfile(profile) }, { status: 201 });
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const body = await parseJsonBody(request);
    const profileInput = parseProfile(body, true);
    const profileId = profileInput.id;
    if (!profileId) throw new ApiError(400, "missing_id", "id is required for profile updates.");
    const { id: _id, ...patch } = profileInput;
    void _id;
    const profile = await updateAiProfile(getRequestDb(), identity.ownerKey, profileId, patch);
    if (!profile) throw new ApiError(404, "not_found", "AI profile not found.");
    return jsonResponse({ profile: publicProfile(profile) });
  });
}
