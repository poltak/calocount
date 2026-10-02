import { useMemo } from "react";
import { useParams } from "react-router";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { ApiExampleLogic } from "./api-example-logic.js";

export function ApiExamplePage() {
  const app = useFrontendApp();
  const { encounterId = "example-encounter" } = useParams();
  const deps = useMemo(
    () => ({
      storage: app.storage,
      services: app.services,
      api: { encounters: app.api.encounters },
      encounterId,
    }),
    [app, encounterId],
  );
  const { logic, state } = useLogic({ LogicClass: ApiExampleLogic, deps });
  const status = {
    pristine: "No command sent yet.",
    running: `Sending ${state.operation}…`,
    success: `${state.operation} completed.`,
    error: "Command failed.",
  }[state.runState];

  return (
    <section>
      <h1>API example</h1>
      <p>
        Encounter: <strong>{encounterId}</strong>
      </p>
      <p>
        Encounter operations are placeholders. The current backend reports that
        they are not implemented.
      </p>
      <div className="actions">
        {(["start", "pause", "stop"] as const).map((operation) => (
          <button
            key={operation}
            disabled={state.runState === "running"}
            onClick={() => {
              void logic.run({ operation });
            }}
          >
            {operation[0].toUpperCase() + operation.slice(1)}
          </button>
        ))}
      </div>
      <output aria-label="Command status">{status}</output>
      {state.runError && <p role="alert">{state.runError}</p>}
      <p>
        Completed commands:{" "}
        <output aria-label="Completed commands">{state.completed}</output>
      </p>
    </section>
  );
}
