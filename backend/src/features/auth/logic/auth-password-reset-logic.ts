import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { AuthUser } from "../services/types.js";
import type { AccountPolicy } from "../types.js";

type AuthPasswordResetProps = BackendLogicProps<never, "auth"> & {
  accountPolicy: AccountPolicy;
};

/**
 * Trusted operator workflow for a user who lost the password. It is never
 * registered as an HTTP endpoint: the person who runs it has the server and
 * the database, so it asks for no other proof.
 */
export class AuthPasswordResetLogic extends Logic<
  AuthPasswordResetProps,
  Record<string, never>
> {
  constructor(deps: AuthPasswordResetProps) {
    super({ deps, initialState: {} });
  }

  /** In single-owner mode the account is the owner's, and `email` is not necessary. */
  async resetPassword({
    email,
    password,
  }: {
    email?: string | undefined;
    password: string;
  }): Promise<AuthUser> {
    const { accountPolicy } = this.deps;
    const given = email?.trim().toLowerCase();
    let accountEmail: string;
    if (accountPolicy.mode === "singleOwner") {
      if (given && given !== accountPolicy.ownerEmail.toLowerCase()) {
        throw new Error(
          `In single-owner mode the only account is ${accountPolicy.ownerEmail}. Give no email address`,
        );
      }
      accountEmail = accountPolicy.ownerEmail;
    } else {
      if (!given) {
        throw new Error("Give the email address of the account");
      }
      accountEmail = given;
    }

    const result = await this.deps.services.auth.resetPassword({
      email: accountEmail,
      password,
    });
    if (result.ok) {
      return result.user;
    }
    if (result.reason === "noAccount") {
      throw new Error(`No account has the email address ${accountEmail}`);
    }
    throw new Error(
      `Use a password of ${result.minLength} to ${result.maxLength} characters`,
    );
  }
}
