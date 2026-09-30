import { z } from "zod";

const authConfigurationSchema = z.object({
  secret: z.string().min(32),
  baseUrl: z.url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.pathname === "/";
  }, "Auth URL must be an HTTP(S) origin without a path"),
  trustedOrigins: z.array(z.url()).default([]),
});

export type AuthConfiguration = z.infer<typeof authConfigurationSchema>;

export function readAuthConfiguration({
  env = process.env,
}: { env?: Record<string, string | undefined> } = {}): AuthConfiguration {
  return authConfigurationSchema.parse({
    secret: env.BETTER_AUTH_SECRET,
    baseUrl: env.BETTER_AUTH_URL,
    trustedOrigins: env.SHADOW_TRUSTED_ORIGINS?.split(",").map((value) =>
      value.trim(),
    ),
  });
}
