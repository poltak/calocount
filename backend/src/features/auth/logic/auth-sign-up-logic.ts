import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import { AppError } from "../../core/errors/app-error.js";
import type {
  AuthUser,
  SessionChange,
  SessionRequest,
} from "../services/types.js";
import type { AccountPolicy } from "../types.js";

type AuthSignUpProps = BackendLogicProps<never, "auth"> & {
  accountPolicy: AccountPolicy;
};

const SIGN_UP_CLOSED = new AppError({
  code: "FORBIDDEN",
  message: "Sign-up is closed",
});

/** Lets a visitor make an account, when the account policy permits it. */
export class AuthSignUpLogic extends Logic<
  AuthSignUpProps,
  Record<string, never>
> {
  constructor(deps: AuthSignUpProps) {
    super({ deps, initialState: {} });
  }

  /** What a visitor without a session may know about sign-up. */
  getStatus(): { isOpen: boolean } {
    return { isOpen: this.deps.accountPolicy.mode === "openSignUp" };
  }

  /** Make the account and start its session. */
  async signUp(
    props: SessionRequest & { email: string; name: string; password: string },
  ): Promise<{ user: AuthUser } & SessionChange> {
    if (!this.getStatus().isOpen) {
      throw SIGN_UP_CLOSED;
    }
    const result = await this.deps.services.auth.signUpWithPassword(props);
    if (result.ok) {
      return { user: result.user, responseHeaders: result.responseHeaders };
    }
    switch (result.reason) {
      case "closed":
        throw SIGN_UP_CLOSED;
      case "emailTaken":
        // The same shape as a validation failure, so the page shows the
        // message at the email field.
        throw new AppError({
          code: "INVALID_REQUEST",
          message: "The request is invalid",
          issues: [
            {
              path: "email",
              message: "An account with this email address exists already",
            },
          ],
        });
      case "rateLimited":
        throw new AppError({
          code: "RATE_LIMITED",
          message: "Too many sign-up attempts. Try again later.",
        });
      case "untrustedOrigin":
        throw new AppError({
          code: "FORBIDDEN",
          message: "Request origin is not allowed",
        });
    }
  }
}
