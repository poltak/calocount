import { Logic } from "@shadow/common/features/core/logic/logic";
import { AppError } from "../../core/errors/app-error.js";
import type { BackendLogicProps } from "../../../logic/types.js";

export type EncounterLifecycleLogicProps = BackendLogicProps<
  "encounterLifecycle",
  "patientRecords"
>;

export interface EncounterLifecycleParams {
  encounterId: string;
}

function notImplemented(): AppError {
  return new AppError({
    code: "NOT_IMPLEMENTED",
    message: "Encounter lifecycle operations are not implemented yet",
  });
}

/** Backend lifecycle boundary. No encounter state or operations exist yet. */
export class EncounterLifecycleLogic extends Logic<
  EncounterLifecycleLogicProps,
  Record<string, never>
> {
  constructor(deps: EncounterLifecycleLogicProps) {
    super({ deps, initialState: {} });
  }

  async start(_params: EncounterLifecycleParams): Promise<void> {
    throw notImplemented();
  }

  async pause(_params: EncounterLifecycleParams): Promise<void> {
    throw notImplemented();
  }

  async stop(_params: EncounterLifecycleParams): Promise<void> {
    throw notImplemented();
  }
}
