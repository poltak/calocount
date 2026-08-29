import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { dateKeyFromTimestamp, localTimeValue, mealDateTimestamp } from "../app/page";

const timezone = "Asia/Ho_Chi_Minh";

function withTimezone<T>(callback: () => T): T {
  const previousTimezone = process.env.TZ;
  process.env.TZ = timezone;
  try {
    return callback();
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
}

test("direct meal timestamps preserve the entered local date and time", () => {
  withTimezone(() => {
    const consumedAt = mealDateTimestamp({ date: "2026-08-26", time: "08:15" });
    assert.equal(consumedAt, Date.parse("2026-08-26T01:15:00.000Z"));
    assert.notEqual(consumedAt, Date.parse("2026-08-26T12:00:00.000Z"));

    const renderedTime = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(consumedAt ?? Number.NaN));
    assert.equal(renderedTime, "08:15");
  });
});

test("direct meals stay on their local calendar date across a UTC boundary", () => {
  withTimezone(() => {
    const consumedAt = mealDateTimestamp({ date: "2026-08-26", time: "06:30" });
    assert.equal(consumedAt, Date.parse("2026-08-25T23:30:00.000Z"));
    assert.equal(dateKeyFromTimestamp(consumedAt ?? Number.NaN, { mode: "local" }), "2026-08-26");
    assert.equal(dateKeyFromTimestamp(consumedAt ?? Number.NaN, { mode: "utc" }), "2026-08-25");
  });
});

test("direct meal timestamp input rejects invalid dates and times", () => {
  assert.equal(mealDateTimestamp({ date: "2026-08-26", time: "25:00" }), null);
  assert.equal(mealDateTimestamp({ date: "2026-08-26", time: "08:60" }), null);
  assert.equal(mealDateTimestamp({ date: "2026-02-30", time: "08:15" }), null);
  assert.equal(mealDateTimestamp({ date: "not-a-date", time: "08:15" }), null);
});

test("local time input defaults to the browser local time", () => {
  withTimezone(() => {
    assert.equal(localTimeValue(new Date("2026-08-26T01:15:00.000Z")), "08:15");
  });
});

test("add meal form submits its validated local time", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /<label>Time<input name="time" type="time" defaultValue=\{localTimeValue\(\)\} required/);
  assert.match(page, /const time = String\(form\.get\("time"\) \|\| ""\)/);
  assert.match(page, /mealDateTimestamp\(\{ date: selectedDay\.date, time \}\)/);
  assert.match(page, /mealRequestOptions\(mealPayload\(nextMeal, consumedAt\), photo\)/);
  assert.match(page, /setActionError\("Enter a valid meal time\."\)/);
});

test("owner summary requests the browser timezone and validates it server-side", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dashboard/summary/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /dashboard\/summary\?timezone=\$\{encodeURIComponent\(browserTimeZone\(\)\)\}/);
  assert.match(page, /buildLiveDays\(parsed, \{ mode: publicView \? "utc" : "local", publicView \}\)/);
  assert.match(page, /dateKeyFromTimestamp\(remoteMeal\.consumedAt, \{ mode: publicView \? "utc" : "local" \}\)/);
  assert.match(route, /searchParams\.get\("timezone"\)/);
  assert.match(route, /isValidTimeZone\(timezone\)/);
  assert.match(route, /timezone must be a valid IANA timezone/);
  assert.match(route, /timezone: timezone \?\? undefined/);
});
