import { useMemo } from "react";
import { useParams } from "react-router";
import { useFrontendApp } from "../../../app/frontend-app-context.js";
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
            disabled={state.busy}
            onClick={() => {
              void logic.run({ operation });
            }}
          >
            {operation[0].toUpperCase() + operation.slice(1)}
          </button>
        ))}
      </div>
      <output aria-label="Command status">{state.message}</output>
      {state.error && <p role="alert">{state.error}</p>}
      <p>
        Completed commands:{" "}
        <output aria-label="Completed commands">{state.completed}</output>
      </p>
    </section>
  );
}
