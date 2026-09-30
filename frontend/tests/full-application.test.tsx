import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrontendAppProvider } from "../src/app/frontend-app-context.js";
import { AppRoutes } from "../src/app/routes.js";
import { ApiExampleLogic } from "../src/features/examples/ui/api-example-logic.js";
import { createFullApplication } from "./fixtures/full-application.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("full application fixture", () => {
  it("drives UI Logic through real handlers into an isolated database without a socket", async () => {
    const fixture = await createFullApplication();
    const db = fixture.backend.storage.encounterLifecycle.props.db.withTables<{
      test_encounter_calls: { encounter_id: string };
    }>();
    const uiLogics: ApiExampleLogic[] = [];
    const originalRun = ApiExampleLogic.prototype.run;
    vi.spyOn(ApiExampleLogic.prototype, "run").mockImplementation(function (
      this: ApiExampleLogic,
      params,
    ) {
      uiLogics.push(this);
      return originalRun.call(this, params);
    });
    try {
      await db.schema
        .createTable("test_encounter_calls")
        .addColumn("encounter_id", "text", (column) => column.notNull())
        .execute();
      // This test operation stands in for the unfinished business method. The
      // real route, validation, client, UI Logic, and database remain in use.
      const start = vi
        .spyOn(fixture.backend.logic.encounterLifecycle, "start")
        .mockImplementation(async ({ encounterId }) => {
          await db
            .insertInto("test_encounter_calls")
            .values({ encounter_id: encounterId })
            .execute();
        });
      const network = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Network must not be used"));
      const view = render(
        <StrictMode>
          <FrontendAppProvider app={fixture.frontend}>
            <MemoryRouter initialEntries={["/examples/api/enc-123"]}>
              <AppRoutes />
            </MemoryRouter>
          </FrontendAppProvider>
        </StrictMode>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Start" }));
      await waitFor(() =>
        expect(screen.getByLabelText("Completed commands").textContent).toBe(
          "1",
        ),
      );
      const uiLogic = uiLogics.at(-1);
      expect(uiLogic?.state).toMatchObject({
        busy: false,
        completed: 1,
        error: null,
      });
      expect(start).toHaveBeenCalledWith({ encounterId: "enc-123" });
      expect(
        await db.selectFrom("test_encounter_calls").selectAll().execute(),
      ).toEqual([{ encounter_id: "enc-123" }]);

      // A real, unmodified operation still exposes the backend's stub error.
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toContain(
          "not implemented",
        ),
      );
      expect(uiLogic?.state.completed).toBe(1);
      expect(network).not.toHaveBeenCalled();
      view.unmount();
      await Promise.resolve();
      network.mockRestore();

      const other = await createFullApplication();
      try {
        const tables =
          await other.backend.storage.encounterLifecycle.props.db.introspection.getTables();
        expect(
          tables.some((table) => table.name === "test_encounter_calls"),
        ).toBe(false);
      } finally {
        await other.close();
      }
    } finally {
      cleanup();
      await Promise.resolve();
      await fixture.close();
    }
  }, 15000);
});
