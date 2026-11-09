import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { AccountPolicy } from "../types.js";

type OwnerSetupProps = BackendLogicProps<"auth", "auth"> & {
  accountPolicy: AccountPolicy;
};

/**
 * Trusted operator workflow for single-owner mode. It is never registered as
 * an HTTP endpoint.
 */
export class OwnerSetupLogic extends Logic<
  OwnerSetupProps,
  Record<string, never>
> {
  constructor(deps: OwnerSetupProps) {
    super({ deps, initialState: {} });
  }

  async createOwner({ name, password }: { name: string; password: string }) {
    const { accountPolicy } = this.deps;
    if (accountPolicy.mode !== "singleOwner") {
      throw new Error(
        "Owner setup is for single-owner mode. In open sign-up mode, each person makes an account on the sign-up page.",
      );
    }
    if (await this.deps.storage.auth.getUserCount()) {
      throw new Error(
        "An account already exists; owner setup does not replace credentials",
      );
    }
    if (!name.trim()) {
      throw new Error("Owner name is required");
    }
    // Concurrent attempts use the same configured email. The SDK's unique
    // email constraint prevents creation of a second account.
    return this.deps.services.auth.createAccount({
      email: accountPolicy.ownerEmail,
      name: name.trim(),
      password,
    });
  }
}
