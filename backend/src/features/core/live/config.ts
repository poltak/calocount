import { z } from "zod";
import type { AuthConfiguration } from "../../auth/services/types.js";

const environmentSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.pathname === "/";
  }, "Auth URL must be an HTTP(S) origin without a path"),
  SHADOW_TRUSTED_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean)
        : [],
    )
    .pipe(z.array(z.url())),
  // The single admitted account. Compared case-insensitively.
  SHADOW_OWNER_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
});

/** Live settings, parsed once from the environment and passed to the App. */
export interface LiveConfig {
  databaseUrl: string;
  auth: AuthConfiguration;
  ownerEmail: string;
  server: { host: string; port: number };
}

export function readLiveConfig(
  env: Record<string, string | undefined> = process.env,
): LiveConfig {
  const parsed = environmentSchema.parse(env);
  return {
    databaseUrl: parsed.DATABASE_URL,
    auth: {
      secret: parsed.BETTER_AUTH_SECRET,
      baseUrl: parsed.BETTER_AUTH_URL,
      trustedOrigins: parsed.SHADOW_TRUSTED_ORIGINS,
    },
    ownerEmail: parsed.SHADOW_OWNER_EMAIL,
    server: { host: parsed.HOST, port: parsed.PORT },
  };
}
