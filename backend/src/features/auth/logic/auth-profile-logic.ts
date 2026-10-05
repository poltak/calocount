import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { AuthUser } from "../services/types.js";

type AuthProfileProps = BackendLogicProps<never, "auth">;

export class AuthProfileLogic extends Logic<
  AuthProfileProps,
  Record<string, never>
> {
  constructor(deps: AuthProfileProps) {
    super({ deps, initialState: {} });
  }

  async updateName({
    user,
    name,
    requestHeaders,
  }: {
    user: AuthUser;
    name: string;
    requestHeaders: Headers;
  }): Promise<AuthUser> {
    await this.deps.services.auth.updateName({ name, requestHeaders });
    return { id: user.id, email: user.email, name };
  }
}
