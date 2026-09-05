import assert from "node:assert/strict";
import test from "node:test";

import { calculateSevenDayAverage } from "../app/dashboard-calculations";
import { millisecondsUntilNextDashboardMinute, scheduleDashboardClock } from "../app/dashboard-clock";

test("clock scheduler updates at minute boundaries and cleans up", () => {
  const scheduled: Array<{ callback: () => void; delay: number }> = [];
  const cleared: unknown[] = [];
  const ticks: Date[] = [];
  const stop = scheduleDashboardClock({
    now: () => new Date("2026-08-30T13:59:20.250Z"),
    onTick: (now) => ticks.push(now),
    setTimer: (callback, delay) => {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimer: (timer) => cleared.push(timer),
  });

  assert.equal(scheduled[0]?.delay, 39_750);
  scheduled[0]?.callback();
  assert.equal(ticks.length, 1);
  assert.equal(scheduled.length, 2);
  stop();
  assert.deepEqual(cleared, [2]);
  scheduled[1]?.callback();
  assert.equal(ticks.length, 1);
});

test("clock delay handles exact and invalid dates safely", () => {
  assert.equal(millisecondsUntilNextDashboardMinute(new Date("2026-08-30T14:00:00.000Z")), 60_000);
  assert.equal(millisecondsUntilNextDashboardMinute(new Date("2026-08-30T14:00:00.500Z")), 59_500);
  assert.equal(millisecondsUntilNextDashboardMinute(new Date(Number.NaN)), 60_000);
});

test("the average changes at the cutoff while chart data stays unchanged", () => {
  const days = [
    ...Array.from({ length: 6 }, (_, index) => ({ date: `2026-08-${String(24 + index).padStart(2, "0")}`, value: 1_000 })),
    { date: "2026-08-30", value: 2_000 },
  ];
  const before = calculateSevenDayAverage({
    days,
    currentDate: "2026-08-30",
    now: new Date("2026-08-30T13:59:59.000Z"),
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const after = calculateSevenDayAverage({
    days,
    currentDate: "2026-08-30",
    now: new Date("2026-08-30T14:00:00.000Z"),
    timeZone: "Asia/Ho_Chi_Minh",
  });

  assert.equal(before, 1_000);
  assert.equal(after, 1_143);
  assert.deepEqual(days.at(-1), { date: "2026-08-30", value: 2_000 });
});

test("the average keeps the last plotted day after the clock rolls to a new date", () => {
  const days = [
    ...Array.from({ length: 6 }, (_, index) => ({ date: `2026-08-${String(24 + index).padStart(2, "0")}`, value: 1_000 })),
    { date: "2026-08-30", value: 2_000 },
  ];

  assert.equal(calculateSevenDayAverage({
    days,
    currentDate: "2026-08-30",
    now: new Date("2026-08-30T17:00:00.000Z"),
    timeZone: "Asia/Ho_Chi_Minh",
  }), 1_143);
  assert.deepEqual(days.map((day) => day.value), [1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 2_000]);
});
