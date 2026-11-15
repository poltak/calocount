import type { Selectable } from "kysely";

/**
 * These tables come from the old app (`backend/migrations/0015`), and
 * they keep its columns, so the owner's passkeys, sessions and connected apps
 * keep working.
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

/** An app that registered itself, such as ChatGPT. */
interface OauthClientTable {
  id: string;
  /** SHA-256 hex of the client secret. `null` for a public client. */
  secretHash: string | null;
  name: string;
  /** A JSON list of the addresses that the app may return to. */
  redirectUrisJson: string;
  tokenEndpointAuthMethod: string;
  createdAt: number;
  /** When the owner last allowed this app. A client that the owner never allowed goes after a day. */
  approvedAt: number | null;
}

/** The owner's approval of one app. Its tokens stop working when it goes. */
interface OauthGrantTable {
  id: string;
  clientId: string;
  ownerKey: string;
  scope: string;
  resource: string;
  createdAt: number;
  lastUsedAt: number | null;
}

/** An authorization code. The ID is the SHA-256 hex of the code, and a code works once. */
interface OauthCodeTable {
  id: string;
  grantId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  createdAt: number;
  expiresAt: number;
}

/** An access or a refresh token. The ID is the SHA-256 hex of the token. */
interface OauthTokenTable {
  id: string;
  kind: "access" | "refresh";
  grantId: string;
  clientId: string;
  createdAt: number;
  expiresAt: number;
}

export interface AuthTables {
  oauthClients: OauthClientTable;
  oauthGrants: OauthGrantTable;
  oauthCodes: OauthCodeTable;
  oauthTokens: OauthTokenTable;
  passkeys: PasskeyTable;
  authSessions: AuthSessionTable;
  authChallenges: AuthChallengeTable;
  authAttempts: AuthAttemptTable;
}

export type OauthClient = Selectable<OauthClientTable>;
export type OauthGrant = Selectable<OauthGrantTable>;
export type OauthToken = Selectable<OauthTokenTable>;
export type NewOauthClient = OauthClientTable;
export type NewOauthGrant = OauthGrantTable;
export type NewOauthCode = OauthCodeTable;
export type NewOauthToken = OauthTokenTable;
export type Passkey = Selectable<PasskeyTable>;
export type AuthSessionRow = Selectable<AuthSessionTable>;
export type ChallengePurpose = AuthChallengeTable["purpose"];
