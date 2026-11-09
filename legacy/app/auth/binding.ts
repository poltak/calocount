import { drizzle } from "drizzle-orm/d1";
import type { AppDb } from "../../db/repository";
import * as schema from "../../db/schema";
import { deleteExpiredOAuthRows } from "./oauth";
import { deleteExpiredAuthRows, findSession } from "./store";

// For code that receives the D1 binding directly: the page code and the cron
// trigger. It does not read the Worker environment module.

function bindingDb(d1: D1Database): AppDb {
  return drizzle(d1, { schema }) as unknown as AppDb;
}

export async function hasLiveSession({ d1, token, ownerKey }: { d1: D1Database; token: string; ownerKey: string }): Promise<boolean> {
  return (await findSession({ db: bindingDb(d1), token, ownerKey })) !== null;
}

/** Remove expired sessions, challenges, codes and tokens. */
export async function deleteExpiredAuthData(d1: D1Database): Promise<void> {
  const db = bindingDb(d1);
  await deleteExpiredAuthRows({ db });
  await deleteExpiredOAuthRows({ db });
}
