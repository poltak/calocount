import { Logic } from "@app/common/features/core/logic/logic";
import { AppError } from "../../core/errors/app-error.js";
import type { BackendLogicProps } from "../../core/logic/types.js";

type HealthProps = BackendLogicProps<"health", "logger">;

/** Reports whether this instance can serve requests. */
export class HealthLogic extends Logic<HealthProps, Record<string, never>> {
  constructor(deps: HealthProps) {
    super({ deps, initialState: {} });
  }

  /** Throws `UNAVAILABLE` when the database does not answer. */
  async checkReadiness(): Promise<void> {
    try {
      await this.deps.storage.health.ping();
    } catch (error) {
      this.deps.services.logger.warn("Readiness check failed", { error });
      throw new AppError({
        code: "UNAVAILABLE",
        message: "The database does not respond",
        cause: error,
      });
    }
  }
}
