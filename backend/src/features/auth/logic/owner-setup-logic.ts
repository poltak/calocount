import { Logic } from "@shadow/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../../logic/types.js";

type OwnerSetupProps = BackendLogicProps<"auth", "auth"> & {
  ownerEmail: string;
};

/** Trusted operator workflow. It is never registered as an HTTP endpoint. */
export class OwnerSetupLogic extends Logic<
  OwnerSetupProps,
  Record<string, never>
> {
  constructor(props: OwnerSetupProps) {
    super({ deps: props, initialState: {} });
  }

  async createOwner({ name, password }: { name: string; password: string }) {
    if (await this.deps.storage.auth.getUserCount()) {
      throw new Error(
        "An account already exists; owner setup does not replace credentials",
      );
    }
    if (!name.trim()) throw new Error("Owner name is required");
    // Concurrent attempts use the same configured email. The SDK's unique
    // email constraint prevents creation of a second account.
    return this.deps.services.auth.createAccount({
      email: this.deps.ownerEmail,
      name: name.trim(),
      password,
    });
  }
}
