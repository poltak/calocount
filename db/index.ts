import { env } from "cloudflare:workers";
import { drizzle, type AnyD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

type StringEnvKey =
  | "CALOCOUNT_ACCESS_AUDIENCE"
  | "CALOCOUNT_ACCESS_TEAM_DOMAIN"
  | "CALOCOUNT_OWNER_EMAIL"
  | "CALOCOUNT_ALLOWED_EMAIL_SHA256"
  | "CALOCOUNT_ALLOWED_EMAIL"
  | "CALOCOUNT_ALLOWED_USER_ID"
  | "CALOCOUNT_ALLOW_LOCAL"
  | "CALOCOUNT_OWNER_KEY";

export function getRuntimeEnv(): Env {
  return env;
}

export function getEnvValue(name: StringEnvKey): string | undefined {
  return (getRuntimeEnv() as unknown as Record<string, string | undefined>)[name];
}

export function getEnvBinding<K extends "DB" | "PHOTOS">(
  name: K,
): Env[K] | undefined {
  return getRuntimeEnv()[name];
}

export function getDb(database?: AnyD1Database) {
  const d1 = database ?? getEnvBinding("DB");
  if (!d1) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(d1, { schema });
}
