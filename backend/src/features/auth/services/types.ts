export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: AuthUser;
  session: { id: string; userId: string; expiresAt: Date };
}

/** SDK boundary. Session identity belongs to the request, never this Service. */
export interface AuthService {
  readonly trustedOrigins: readonly string[];
  handle(request: Request): Promise<Response>;
  getSession(props: { headers: Headers }): Promise<AuthSession | null>;
  migrate(): Promise<void>;
  /** Trusted local setup only; this operation has no public HTTP endpoint. */
  createAccount(props: {
    email: string;
    name: string;
    password: string;
  }): Promise<AuthUser>;
}
