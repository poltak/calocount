export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: AuthUser;
  session: { id: string; userId: string; expiresAt: Date };
}

/** Settings the auth implementation needs. The live root reads them from the environment. */
export interface AuthConfiguration {
  /** Session secret, at least 32 characters. */
  secret: string;
  /** The server's HTTP(S) origin, without a path. */
  baseUrl: string;
  trustedOrigins: string[];
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
export interface AuthServiceInterface {
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
  /** Rename the user who owns the session in the request headers. */
  updateName(props: { name: string; requestHeaders: Headers }): Promise<void>;
  migrate(): Promise<void>;
  /** Trusted local setup only; this operation has no public HTTP endpoint. */
  createAccount(props: {
    email: string;
    name: string;
    password: string;
  }): Promise<AuthUser>;
}
