import { and, count, eq, gt, inArray, lt, lte, sql } from "drizzle-orm";
import type { AppDb } from "../../db/repository";
import { authAttempts, authChallenges, authSessions, passkeys, type Passkey } from "../../db/schema";
import { randomToken, sha256Hex } from "./tokens";

// This module takes the database as an argument and does not read the Worker
// environment, so the page code can use it with the D1 binding it receives.

const DAY_MS = 24 * 60 * 60 * 1000;
/** A session that nobody uses for this long ends. Each use moves the end. */
export const SESSION_IDLE_TTL_MS = 180 * DAY_MS;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type ChallengePurpose = "registration" | "authentication";

export async function createSession({ db, ownerKey, passkeyId, now = Date.now() }: {
  db: AppDb;
  ownerKey: string;
  passkeyId: string | null;
  now?: number;
}): Promise<string> {
  const token = randomToken();
  await db.insert(authSessions).values({
    id: await sha256Hex(token),
    ownerKey,
    passkeyId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + SESSION_IDLE_TTL_MS,
  });
  return token;
}

/**
 * The live session of a cookie token, or null. A session that was last seen
 * more than a day ago gets a new end, so an owner who uses the app stays signed in.
 */
export async function findSession({ db, token, ownerKey, now = Date.now() }: {
  db: AppDb;
  token: string;
  ownerKey: string;
  now?: number;
}) {
  const id = await sha256Hex(token);
  const session = await db.select().from(authSessions)
    .where(and(eq(authSessions.id, id), eq(authSessions.ownerKey, ownerKey), gt(authSessions.expiresAt, now)))
    .limit(1).get();
  if (!session) return null;
  if (now - session.lastSeenAt > DAY_MS) {
    await db.update(authSessions)
      .set({ lastSeenAt: now, expiresAt: now + SESSION_IDLE_TTL_MS })
      .where(eq(authSessions.id, id));
  }
  return session;
}

export async function deleteSession({ db, token }: { db: AppDb; token: string }): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.id, await sha256Hex(token)));
}

/** Store a challenge for one answer, and return the ID the browser sends back with that answer. */
export async function saveChallenge({ db, ownerKey, purpose, challenge, now = Date.now() }: {
  db: AppDb;
  ownerKey: string;
  purpose: ChallengePurpose;
  challenge: string;
  now?: number;
}): Promise<string> {
  const id = randomToken();
  await db.insert(authChallenges).values({ id, ownerKey, purpose, challenge, createdAt: now, expiresAt: now + CHALLENGE_TTL_MS });
  return id;
}

/** Remove a challenge and return it. A challenge works once, and only before it expires. */
export async function takeChallenge({ db, id, ownerKey, purpose, now = Date.now() }: {
  db: AppDb;
  id: string;
  ownerKey: string;
  purpose: ChallengePurpose;
  now?: number;
}): Promise<string | null> {
  const [row] = await db.delete(authChallenges)
    .where(and(eq(authChallenges.id, id), eq(authChallenges.ownerKey, ownerKey), eq(authChallenges.purpose, purpose)))
    .returning({ challenge: authChallenges.challenge, expiresAt: authChallenges.expiresAt });
  return row && row.expiresAt > now ? row.challenge : null;
}

export async function listPasskeys({ db, ownerKey }: { db: AppDb; ownerKey: string }): Promise<Passkey[]> {
  return db.select().from(passkeys).where(eq(passkeys.ownerKey, ownerKey)).orderBy(passkeys.createdAt).all();
}

export async function findPasskey({ db, ownerKey, id }: { db: AppDb; ownerKey: string; id: string }) {
  return db.select().from(passkeys).where(and(eq(passkeys.ownerKey, ownerKey), eq(passkeys.id, id))).limit(1).get();
}

export async function countPasskeys({ db, ownerKey }: { db: AppDb; ownerKey: string }): Promise<number> {
  const row = await db.select({ value: count() }).from(passkeys).where(eq(passkeys.ownerKey, ownerKey)).get();
  return row?.value ?? 0;
}

export async function insertPasskey({ db, passkey }: { db: AppDb; passkey: typeof passkeys.$inferInsert }): Promise<void> {
  await db.insert(passkeys).values(passkey);
}

export async function recordPasskeyUse({ db, id, counter, backedUp, now = Date.now() }: {
  db: AppDb;
  id: string;
  counter: number;
  backedUp: boolean;
  now?: number;
}): Promise<void> {
  await db.update(passkeys).set({ counter, backedUp, lastUsedAt: now }).where(eq(passkeys.id, id));
}

/**
 * Remove a passkey and end the sessions that it signed in. The last passkey
 * stays: the count is part of the same statement, so two parallel removals
 * cannot remove the last two passkeys.
 */
export async function deletePasskey({ db, ownerKey, id }: { db: AppDb; ownerKey: string; id: string }): Promise<"removed" | "last" | "missing"> {
  const others = sql`(select count(*) from ${passkeys} where ${passkeys.ownerKey} = ${ownerKey}) > 1`;
  const removed = await db.delete(passkeys)
    .where(and(eq(passkeys.ownerKey, ownerKey), eq(passkeys.id, id), others))
    .returning({ id: passkeys.id });
  if (removed.length === 0) return (await findPasskey({ db, ownerKey, id })) ? "last" : "missing";
  await db.delete(authSessions).where(and(eq(authSessions.ownerKey, ownerKey), eq(authSessions.passkeyId, id)));
  return "removed";
}

export async function countRecentAttempts({ db, kind, since }: { db: AppDb; kind: string; since: number }): Promise<number> {
  const row = await db.select({ value: count() }).from(authAttempts)
    .where(and(eq(authAttempts.kind, kind), gt(authAttempts.createdAt, since))).get();
  return row?.value ?? 0;
}

export type AttemptLimit = { kind: string; max: number; windowMs: number };

/**
 * Count one attempt against each limit before the caller checks it. The rows
 * go in first, so parallel requests cannot pass a limit together. A refused
 * attempt removes its rows again, so refused requests do not use up a shared
 * limit. Returns the IDs of the rows, or null when a limit is reached.
 */
export async function takeAttempt({ db, limits, now = Date.now() }: {
  db: AppDb;
  limits: AttemptLimit[];
  now?: number;
}): Promise<string[] | null> {
  const rows = limits.map((limit) => ({ id: randomToken(16), kind: limit.kind, createdAt: now }));
  await db.insert(authAttempts).values(rows);
  const counts = await Promise.all(limits.map((limit) => countRecentAttempts({ db, kind: limit.kind, since: now - limit.windowMs })));
  const ids = rows.map((row) => row.id);
  if (counts.every((value, index) => value <= limits[index].max)) return ids;
  await forgetAttempts({ db, ids });
  return null;
}

/** Remove attempts that must not count, such as a correct setup code. */
export async function forgetAttempts({ db, ids }: { db: AppDb; ids: string[] }): Promise<void> {
  await db.delete(authAttempts).where(inArray(authAttempts.id, ids));
}

/** Remove expired sessions and challenges, and attempts that no rate limit counts any more. */
export async function deleteExpiredAuthRows({ db, now = Date.now() }: { db: AppDb; now?: number }): Promise<void> {
  await db.batch([
    db.delete(authSessions).where(lte(authSessions.expiresAt, now)),
    db.delete(authChallenges).where(lte(authChallenges.expiresAt, now)),
    db.delete(authAttempts).where(lt(authAttempts.createdAt, now - DAY_MS)),
  ]);
}
