import type { LogLevel } from "@app/common/features/core/services/types";
import { LOG_LEVELS } from "@app/common/features/core/utils/log-level";
import { z } from "zod";
import type { AuthConfiguration } from "../../auth/services/types.js";
import type { AccountPolicy } from "../../auth/types.js";

// The settings of any root. A setting of one engine or one host is apart from
// these, so a root on another engine does not need it. See docs/agents/hosting.md.
const environmentVariablesSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.pathname === "/";
  }, "Auth URL must be an HTTP(S) origin without a path"),
  APP_TRUSTED_ORIGINS: z
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
  // Who can have an account. See `AccountPolicy`.
  APP_ACCOUNT_MODE: z
    .enum(["single-owner", "open-sign-up"])
    .default("single-owner"),
  // The one admitted account in single-owner mode. Compared
  // case-insensitively. An empty value counts as unset.
  APP_OWNER_EMAIL: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.email().optional()),
  // Set it only behind a proxy. An empty value counts as unset.
  APP_CLIENT_ADDRESS_HEADER: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => value || undefined),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  // JSON is the default, so a production host needs no setting to get it.
  LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

const environmentSchema = environmentVariablesSchema.transform(
  (environment, context) => {
    const { APP_ACCOUNT_MODE, APP_OWNER_EMAIL, ...rest } = environment;
    if (APP_ACCOUNT_MODE === "open-sign-up") {
      const accountPolicy: AccountPolicy = { mode: "openSignUp" };
      return { ...rest, accountPolicy };
    }
    if (!APP_OWNER_EMAIL) {
      context.addIssue({
        code: "custom",
        path: ["APP_OWNER_EMAIL"],
        message: "Single-owner mode needs the owner's email address",
      });
      return z.NEVER;
    }
    const accountPolicy: AccountPolicy = {
      mode: "singleOwner",
      ownerEmail: APP_OWNER_EMAIL,
    };
    return { ...rest, accountPolicy };
  },
);

export interface LiveConfig {
  auth: AuthConfiguration;
  accountPolicy: AccountPolicy;
  server: {
    host: string;
    port: number;
    clientAddressHeader?: string | undefined;
  };
  log: { format: "json" | "pretty"; level: LogLevel };
}

export function readLiveConfig(
  env: Record<string, string | undefined> = process.env,
): LiveConfig {
  const parsed = environmentSchema.parse(env);
  return {
    auth: {
      secret: parsed.BETTER_AUTH_SECRET,
      baseUrl: parsed.BETTER_AUTH_URL,
      trustedOrigins: parsed.APP_TRUSTED_ORIGINS,
      allowSignUp: parsed.accountPolicy.mode === "openSignUp",
    },
    accountPolicy: parsed.accountPolicy,
    server: {
      host: parsed.HOST,
      port: parsed.PORT,
      clientAddressHeader: parsed.APP_CLIENT_ADDRESS_HEADER,
    },
    log: { format: parsed.LOG_FORMAT, level: parsed.LOG_LEVEL },
  };
}

const databaseVariablesSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
});

/** The connection URL of the PostgreSQL root. */
export function readDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return databaseVariablesSchema.parse(env).DATABASE_URL;
}
