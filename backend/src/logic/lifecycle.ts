import type { BackendLogic } from "../index.js";

export async function initializeLogic({
  logic,
}: {
  logic: BackendLogic;
}): Promise<void> {
  await Promise.all(
    Object.values(logic).map((instance) => instance.initialize()),
  );
}

export async function cleanupLogic({
  logic,
}: {
  logic: BackendLogic;
}): Promise<void> {
  const results = await Promise.allSettled(
    Object.values(logic).map((instance) => instance.cleanup()),
  );
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (errors.length)
    throw new AggregateError(errors, "Backend Logic cleanup failed");
}
