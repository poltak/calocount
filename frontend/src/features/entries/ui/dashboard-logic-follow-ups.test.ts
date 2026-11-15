import { describe, expect, it, vi } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { DashboardLogic } from "./dashboard-logic.js";
import { DAY_MS, dateAgo, seedEntry, todayKey } from "./entry-test-helpers.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(
    params,
    (app) =>
      new DashboardLogic({
        ...app.frontend,
        audience: "owner",
        entryEvents: [],
        settingsEvents: [],
        weightEvents: [],
      }),
  );
}

describe("DashboardLogic saved entries read tests", () => {
  it("should load the dashboard when the saved entries cannot be read", async () => {
    const app = await setupTest({ skipInitialization: true });
    await seedEntry(app, { name: "Oats" });
    await app.backend.db.schema.dropTable("savedEntries").execute();

    await app.logic.initialize();

    expect(app.logic.state.loaded).toEqual(true);
    expect(app.logic.state.loadDashboardState).toEqual("success");
    expect(app.logic.state.loadDashboardError).toEqual(null);
    expect(app.logic.state.savedEntries).toEqual([]);
    expect(app.logic.state.loadSavedEntriesError).not.toEqual(null);
    expect(app.logic.state.entries.map(({ name }) => name)).toEqual(["Oats"]);
  });
});

describe("DashboardLogic day change tests", () => {
  it("should name the day that it reads, and keep the rows of the day before until it arrives", async () => {
    const app = await setupTest();
    await seedEntry(app, { name: "Oats" });
    await app.logic.loadDashboard();
    expect(app.logic.state.entries).toHaveLength(1);
    const slow = app.transport.holdNextRequest();

    const selectP = app.logic.selectDate({ date: dateAgo(app, 1) });
    await slow.reached;

    expect(app.logic.state.loadDayState).toEqual("running");
    expect(app.logic.state.loadingDate).toEqual(dateAgo(app, 1));
    expect(app.logic.state.entries).toHaveLength(1);
    slow.release();
    await selectP;

    expect(app.logic.state.loadingDate).toEqual(null);
    expect(app.logic.state.entries).toEqual([]);
  });

  it("should not keep the rows of the day before when the new day cannot be read", async () => {
    const app = await setupTest();
    await seedEntry(app, { name: "Oats" });
    await app.logic.loadDashboard();
    app.transport.goOffline();

    await app.logic.selectDate({ date: dateAgo(app, 1) });

    expect(app.logic.state.loadDayState).toEqual("error");
    expect(app.logic.state.loadingDate).toEqual(null);
    expect(app.logic.state.entries).toEqual([]);
  });
});

describe("DashboardLogic weight form request tests", () => {
  it("should count each request to open the weight form", async () => {
    const { logic } = await setupTest();
    expect(logic.state.weightFormRequest).toEqual(0);

    logic.requestWeightForm();
    logic.requestWeightForm();

    expect(logic.state.weightFormRequest).toEqual(2);
  });
});

describe("DashboardLogic new day tests", () => {
  it("should read again after midnight, and not before", async () => {
    const app = await setupTest();
    const firstDay = todayKey(app);
    const { frontend, backend } = app;
    const reads = app.logic.state.reloadKey;

    frontend.services.ticker.tick();
    expect(app.logic.state.reloadKey).toEqual(reads);
    expect(app.logic.state.today).toEqual(firstDay);

    frontend.services.clock.advance(DAY_MS);
    backend.services.clock.advance(DAY_MS);
    frontend.services.ticker.tick();

    const secondDay = todayKey(app);
    expect(secondDay).not.toEqual(firstDay);
    await vi.waitFor(() => expect(app.logic.state.today).toEqual(secondDay));
    expect(app.logic.state.reloadKey).toBeGreaterThan(reads);
    expect(app.logic.state.selectedDate).toEqual(secondDay);
  });
});
