import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { AuthUser } from "../services/types.js";

type AuthAccessProps = BackendLogicProps & { ownerEmail: string };

/** Current admission policy; a valid session alone does not admit other users. */
export class AuthAccessLogic extends Logic<
  AuthAccessProps,
  Record<string, never>
> {
  constructor(deps: AuthAccessProps) {
    super({ deps, initialState: {} });
  }

  isAllowed({ user }: { user: AuthUser }): boolean {
    return user.email.toLowerCase() === this.deps.ownerEmail;
  }
}
