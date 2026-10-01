export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: AuthUser;
  session: { id: string; userId: string; expiresAt: Date };
}

/** A session change, with headers (such as cookies) the HTTP response must carry. */
export interface SessionChange {
  responseHeaders: Headers;
}

export type PasswordSignInResult =
  | ({ ok: true; user: AuthUser } & SessionChange)
  | {
      ok: false;
      reason: "invalidCredentials" | "rateLimited" | "untrustedOrigin";
    };

/** Authentication boundary. Session identity belongs to the request, never this Service. */
export interface AuthService {
  readonly trustedOrigins: readonly string[];
  getSession(props: { headers: Headers }): Promise<AuthSession | null>;
  /** Request headers carry the caller's origin and address for the provider's checks. */
  signInWithPassword(props: {
    email: string;
    password: string;
    requestHeaders: Headers;
  }): Promise<PasswordSignInResult>;
  /** End the caller's session. Succeeds when there is no session. */
  signOut(props: { requestHeaders: Headers }): Promise<SessionChange>;
  migrate(): Promise<void>;
  /** Trusted local setup only; this operation has no public HTTP endpoint. */
  createAccount(props: {
    email: string;
    name: string;
    password: string;
  }): Promise<AuthUser>;
}
