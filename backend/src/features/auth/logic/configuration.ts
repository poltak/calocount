import { z } from "zod";

/** The single admitted account. Compared case-insensitively. */
export const ownerEmailSchema = z.string().trim().toLowerCase().pipe(z.email());
