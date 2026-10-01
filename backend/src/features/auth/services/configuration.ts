import { z } from "zod";

export const authConfigurationSchema = z.object({
  secret: z.string().min(32),
  baseUrl: z.url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.pathname === "/";
  }, "Auth URL must be an HTTP(S) origin without a path"),
  trustedOrigins: z.array(z.url()).default([]),
});

export type AuthConfiguration = z.infer<typeof authConfigurationSchema>;
