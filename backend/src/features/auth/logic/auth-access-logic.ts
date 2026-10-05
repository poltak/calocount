import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { AuthUser } from "../services/types.js";
import type { AccountPolicy } from "../types.js";

type AuthAccessProps = BackendLogicProps & { accountPolicy: AccountPolicy };

/** The admission rule. In single-owner mode, a valid session alone does not admit a user. */
export class AuthAccessLogic extends Logic<
  AuthAccessProps,
  Record<string, never>
> {
  constructor(deps: AuthAccessProps) {
    super({ deps, initialState: {} });
  }

  isAllowed({ user }: { user: AuthUser }): boolean {
    const { accountPolicy } = this.deps;
    return (
      accountPolicy.mode === "openSignUp" ||
      user.email.toLowerCase() === accountPolicy.ownerEmail
    );
  }
}
