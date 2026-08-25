import { upsertDailyWeight } from "../../../db/repository";
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
import { withoutOwnerKey } from "../_lib/serialise";

function parseLogicalDate(value: unknown): string {
  const logicalDate = requireString(value, "logicalDate", { max: 10 });
  const parsed = logicalDate ? new Date(`${logicalDate}T00:00:00.000Z`) : null;
  if (
    !logicalDate
    || !/^\d{4}-\d{2}-\d{2}$/.test(logicalDate)
    || !parsed
    || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== logicalDate
  ) {
    throw new ApiError(400, "invalid_field", "logicalDate must be a valid YYYY-MM-DD date.");
  }
  return logicalDate;
}

export async function PUT(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = requireApiIdentity(request);
    const body = await parseJsonBody(request);
    const logicalDate = parseLogicalDate(body.logicalDate);
    const weightKg = optionalNumber(body.weightKg, "weightKg", { min: 1, max: 1_000 });
    if (weightKg == null) {
      throw new ApiError(400, "invalid_field", "weightKg is required.");
    }

    const weight = await upsertDailyWeight({
      db: getRequestDb(),
      ownerKey: identity.ownerKey,
      input: { logicalDate, weightKg },
    });
    return jsonResponse({ weight: withoutOwnerKey(weight) });
  });
}
