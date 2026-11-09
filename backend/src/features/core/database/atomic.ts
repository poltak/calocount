import type { BackendStorage } from "../types.js";
import type { RunAtomic, PlanningStorage } from "../logic/types.js";
import type { D1Binding, D1Outcome } from "./d1-binding.js";
import { DatabaseNames } from "./database-names.js";
import type { PlannedStatement, StatementResult } from "./planned-statement.js";

const names = new DatabaseNames();

function toResult(outcome: D1Outcome): StatementResult<unknown> {
  const rows = (outcome.results ?? []) as Record<string, unknown>[];
  const rowsWritten = outcome.meta.rows_written;
  return {
    rows: rows.map((row) => names.rowInTypeScript(row)),
    changes: outcome.meta.changes ?? 0,
    rowsWritten: typeof rowsWritten === "number" ? rowsWritten : null,
  };
}

/**
 * `atomic` for a Logic class. The plan callback is synchronous, so it can only
 * list statements. The Storage plan methods build them without a query.
 */
export function createRunAtomic({
  binding,
  storage,
}: {
  binding: D1Binding;
  storage: BackendStorage;
}): RunAtomic {
  const planning: PlanningStorage = storage;
  return async (plan) => {
    const statements: readonly PlannedStatement<unknown>[] = plan(planning);
    if (statements.length === 0) {
      return [] as never;
    }
    const outcomes = await binding.batch(
      statements.map(({ compiled }) =>
        binding.prepare(compiled.sql).bind(...compiled.parameters),
      ),
    );
    return outcomes.map(toResult) as never;
  };
}
