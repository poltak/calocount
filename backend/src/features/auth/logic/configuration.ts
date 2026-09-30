import { z } from "zod";

export function ownerEmail(value: unknown): string {
  return z.string().trim().toLowerCase().pipe(z.email()).parse(value);
}

export function readOwnerEmail({
  env = process.env,
}: { env?: Record<string, string | undefined> } = {}): string {
  return ownerEmail(env.SHADOW_OWNER_EMAIL);
}
