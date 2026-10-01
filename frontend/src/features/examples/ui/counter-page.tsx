import { useMemo } from "react";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { CounterLogic } from "./counter-logic.js";

export function CounterPage() {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({ storage: app.storage, services: app.services, api: {} }),
    [app],
  );
  const { logic, state } = useLogic({ LogicClass: CounterLogic, deps });

  return (
    <section>
      <h1>Counter example</h1>
      <p>This page owns its own state. Leaving the page resets the example.</p>
      <output className="counter" aria-label="Count">
        {state.count}
      </output>
      <div className="actions">
        <button onClick={() => logic.decrement()}>Decrease</button>
        <button onClick={() => logic.increment()}>Increase</button>
        <button onClick={() => logic.reset()}>Reset</button>
      </div>
    </section>
  );
}
