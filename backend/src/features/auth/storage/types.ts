import type { Selectable } from "kysely";

/**
 * These four tables come from the old app (`backend/migrations/0015`), and
 * they keep its columns, so the owner's passkeys and sessions keep working.
 * Every row carries `ownerKey`, the key of the owner's data.
 */

interface PasskeyTable {
  /** WebAuthn credential ID, base64url. */
  id: string;
  ownerKey: string;
  /** Base64url of the COSE public key bytes. */
  publicKey: string;
  counter: number;
  /** A JSON list of transport names. */
  transportsJson: string;
  deviceType: "singleDevice" | "multiDevice";
  /** 0 or 1. */
  backedUp: number;
  /** A short name from the device that made it, such as `Mac`. */
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

interface AuthSessionTable {
  /** SHA-256 hex of the token in the cookie. The database never holds the token. */
  id: string;
  ownerKey: string;
  passkeyId: string | null;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

interface AuthChallengeTable {
  id: string;
  ownerKey: string;
  purpose: "registration" | "authentication";
  challenge: string;
  createdAt: number;
  expiresAt: number;
}

/** One row for each setup code attempt, so that the limits can count them. */
interface AuthAttemptTable {
  id: string;
  kind: string;
  createdAt: number;
}

export interface AuthTables {
  passkeys: PasskeyTable;
  authSessions: AuthSessionTable;
  authChallenges: AuthChallengeTable;
  authAttempts: AuthAttemptTable;
}

export type Passkey = Selectable<PasskeyTable>;
export type AuthSessionRow = Selectable<AuthSessionTable>;
export type ChallengePurpose = AuthChallengeTable["purpose"];
