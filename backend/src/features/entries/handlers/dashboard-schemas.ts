import {
  isDateKey,
  isMonthKey,
  isValidTimeZone,
} from "@app/common/features/core/utils/logical-date";
import { z } from "zod";

export const timeZoneQuery = z.object({
  timezone: z
    .string()
    .refine(isValidTimeZone, "timezone must be a valid IANA timezone.")
    .optional(),
});

export const dateParam = z.object({
  date: z
    .string()
    .refine(isDateKey, "The date must be a valid YYYY-MM-DD date."),
});

export const monthQuery = timeZoneQuery.extend({
  month: z.string().refine(isMonthKey, "month must be a valid YYYY-MM month."),
});
