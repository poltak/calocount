import { Logic } from "@shadow/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../../logic/types.js";

export type EncounterLifecycleLogicProps = BackendLogicProps<
  "encounterLifecycle",
  "patientRecords"
>;

export interface EncounterLifecycleParams {
  encounterId: string;
}

export class EncounterLifecycleNotImplementedError extends Error {
  constructor() {
    super("Encounter lifecycle operations are not implemented yet");
    this.name = "EncounterLifecycleNotImplementedError";
  }
}

/** Backend lifecycle boundary. No encounter state or operations exist yet. */
export class EncounterLifecycleLogic extends Logic<
  EncounterLifecycleLogicProps,
  Record<string, never>
> {
  constructor(readonly props: EncounterLifecycleLogicProps) {
    super({ deps: props, initialState: {} });
  }

  async start(_params: EncounterLifecycleParams): Promise<void> {
    throw new EncounterLifecycleNotImplementedError();
  }

  async pause(_params: EncounterLifecycleParams): Promise<void> {
    throw new EncounterLifecycleNotImplementedError();
  }

  async stop(_params: EncounterLifecycleParams): Promise<void> {
    throw new EncounterLifecycleNotImplementedError();
  }
}
