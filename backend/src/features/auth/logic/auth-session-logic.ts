import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import {
  AppError,
  tooManyAttempts,
  type AppErrorCode,
} from "../../core/errors/app-error.js";
import type {
  AuthUser,
  PasswordSignInResult,
  SessionChange,
  SessionRequest,
} from "../services/types.js";

type AuthSessionProps = BackendLogicProps<never, "auth">;

type SignInFailure = Extract<PasswordSignInResult, { ok: false }>["reason"];

const signInErrors: Record<
  Exclude<SignInFailure, "rateLimited">,
  { code: AppErrorCode; message: string }
> = {
  invalidCredentials: {
    code: "UNAUTHENTICATED",
    message: "Invalid email or password",
  },
  untrustedOrigin: {
    code: "FORBIDDEN",
    message: "Request origin is not allowed",
  },
};

/** Starts and ends sessions. Admission is still checked on each request. */
export class AuthSessionLogic extends Logic<
  AuthSessionProps,
  Record<string, never>
> {
  constructor(deps: AuthSessionProps) {
    super({ deps, initialState: {} });
  }

  async signIn(
    props: SessionRequest & { email: string; password: string },
  ): Promise<{ user: AuthUser } & SessionChange> {
    const result = await this.deps.services.auth.signInWithPassword(props);
    if (!result.ok) {
      if (result.reason === "rateLimited") {
        const { retryAfterSeconds } = result;
        throw tooManyAttempts({ action: "sign-in", retryAfterSeconds });
      }
      throw new AppError(signInErrors[result.reason]);
    }
    return { user: result.user, responseHeaders: result.responseHeaders };
  }

  signOut(props: SessionRequest): Promise<SessionChange> {
    return this.deps.services.auth.signOut(props);
  }
}
