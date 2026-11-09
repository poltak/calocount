import {
  planQuery,
  planRaw,
  planWrite,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";
import type { BackendStorageProps } from "../../core/storage/types.js";
import type { AuthSessionRow, ChallengePurpose, Passkey } from "./types.js";

/** The passkeys, the WebAuthn challenges, the sessions, and the setup code attempts. */
export class AuthStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  // ---------- Passkeys ----------

  listPasskeys({ ownerKey }: { ownerKey: string }): Promise<Passkey[]> {
    return this.deps.db
      .selectFrom("passkeys")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .orderBy("createdAt")
      .orderBy("id")
      .execute();
  }

  async countPasskeys({ ownerKey }: { ownerKey: string }): Promise<number> {
    const row = await this.deps.db
      .selectFrom("passkeys")
      .select((expression) => expression.fn.countAll<number>().as("total"))
      .where("ownerKey", "=", ownerKey)
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }

  findPasskey({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): Promise<Passkey | undefined> {
    return this.deps.db
      .selectFrom("passkeys")
      .selectAll()
      .where("ownerKey", "=", ownerKey)
      .where("id", "=", id)
      .executeTakeFirst();
  }

  planInsertPasskey(
    passkey: Omit<Passkey, "lastUsedAt">,
  ): PlannedStatement<never> {
    return planQuery(this.deps.db.insertInto("passkeys").values(passkey));
  }

  planPasskeyUsed({
    id,
    counter,
    backedUp,
    now,
  }: {
    id: string;
    counter: number;
    backedUp: number;
    now: number;
  }): PlannedStatement<never> {
    return planWrite(
      this.deps.db
        .updateTable("passkeys")
        .set({ counter, backedUp, lastUsedAt: now })
        .where("id", "=", id),
    );
  }

  /**
   * The guard stays in the statement, because two removals at the same time
   * must not remove the last two passkeys and lock the owner out.
   */
  planDeletePasskeyIfNotLast({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: `DELETE FROM passkeys
            WHERE owner_key = ?1 AND id = ?2
              AND (SELECT COUNT(*) FROM passkeys WHERE owner_key = ?1) > 1`,
      parameters: [ownerKey, id],
    });
  }

  planPasskeyExists({
    ownerKey,
    id,
  }: {
    ownerKey: string;
    id: string;
  }): PlannedStatement<{ found: number }> {
    return planRaw({
      sql: `SELECT EXISTS (SELECT 1 FROM passkeys WHERE owner_key = ?1 AND id = ?2) AS found`,
      parameters: [ownerKey, id],
    });
  }

  // ---------- WebAuthn challenges ----------

  async insertChallenge(challenge: {
    id: string;
    ownerKey: string;
    purpose: ChallengePurpose;
    challenge: string;
    createdAt: number;
    expiresAt: number;
  }): Promise<void> {
    await this.deps.db.insertInto("authChallenges").values(challenge).execute();
  }

  /** Delete the row and return it, so that a replay finds nothing. */
  takeChallenge({
    id,
    ownerKey,
    purpose,
  }: {
    id: string;
    ownerKey: string;
    purpose: ChallengePurpose;
  }): Promise<{ challenge: string; expiresAt: number } | undefined> {
    return this.deps.db
      .deleteFrom("authChallenges")
      .where("id", "=", id)
      .where("ownerKey", "=", ownerKey)
      .where("purpose", "=", purpose)
      .returning(["challenge", "expiresAt"])
      .executeTakeFirst();
  }

  // ---------- Sessions ----------

  findSession({
    id,
    ownerKey,
    now,
  }: {
    id: string;
    ownerKey: string;
    now: number;
  }): Promise<AuthSessionRow | undefined> {
    return this.deps.db
      .selectFrom("authSessions")
      .selectAll()
      .where("id", "=", id)
      .where("ownerKey", "=", ownerKey)
      .where("expiresAt", ">", now)
      .executeTakeFirst();
  }

  async renewSession({
    id,
    now,
    expiresAt,
  }: {
    id: string;
    now: number;
    expiresAt: number;
  }): Promise<void> {
    await this.deps.db
      .updateTable("authSessions")
      .set({ lastSeenAt: now, expiresAt })
      .where("id", "=", id)
      .execute();
  }

  planInsertSession(session: {
    id: string;
    ownerKey: string;
    passkeyId: string | null;
    createdAt: number;
    lastSeenAt: number;
    expiresAt: number;
  }): PlannedStatement<never> {
    return planQuery(this.deps.db.insertInto("authSessions").values(session));
  }

  async deleteSession({ id }: { id: string }): Promise<void> {
    await this.deps.db
      .deleteFrom("authSessions")
      .where("id", "=", id)
      .execute();
  }

  /** Run after `planDeletePasskeyIfNotLast`: only a removed passkey ends its sessions. */
  planDeleteSessionsOfRemovedPasskey({
    ownerKey,
    passkeyId,
  }: {
    ownerKey: string;
    passkeyId: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: `DELETE FROM auth_sessions
            WHERE owner_key = ?1 AND passkey_id = ?2
              AND NOT EXISTS (SELECT 1 FROM passkeys WHERE id = ?2)`,
      parameters: [ownerKey, passkeyId],
    });
  }

  // ---------- Setup code attempts ----------

  planInsertAttempts(
    attempts: { id: string; kind: string; createdAt: number }[],
  ): PlannedStatement<never> {
    return planQuery(this.deps.db.insertInto("authAttempts").values(attempts));
  }

  planCountAttempts({
    kind,
    since,
  }: {
    kind: string;
    since: number;
  }): PlannedStatement<{ total: number }> {
    return planRaw({
      sql: `SELECT COUNT(*) AS total FROM auth_attempts WHERE kind = ?1 AND created_at > ?2`,
      parameters: [kind, since],
    });
  }

  planDeleteAttempts({ ids }: { ids: string[] }): PlannedStatement<never> {
    return planWrite(
      this.deps.db.deleteFrom("authAttempts").where("id", "in", ids),
    );
  }
}
