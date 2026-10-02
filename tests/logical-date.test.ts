import assert from "node:assert/strict";
import test from "node:test";

import { isValidTimeZone, logicalDateWindow, resolveTimeZone, shiftDateKey, utcOffsetSegments, zonedCalendar } from "../domain/logical-date";

const HOUR_MS = 3_600_000;

test("a calendar reports the date and hour a moment has in its timezone", () => {
  const moment = Date.parse("2026-09-11T23:30:00Z");
  assert.equal(zonedCalendar("UTC").dateKey(moment), "2026-09-11");
  assert.equal(zonedCalendar("Asia/Ho_Chi_Minh").dateKey(moment), "2026-09-12");
  assert.equal(zonedCalendar("America/Los_Angeles").dateKey(moment), "2026-09-11");
  assert.equal(zonedCalendar("Asia/Ho_Chi_Minh").hour(moment), 6);
  assert.equal(zonedCalendar("UTC").hour(moment), 23);
});

test("the first instant of a date is local midnight, including on days that are not 24 hours long", () => {
  assert.equal(zonedCalendar("Asia/Ho_Chi_Minh").firstInstant("2026-09-12"), Date.parse("2026-09-11T17:00:00Z"));
  assert.equal(zonedCalendar("UTC").firstInstant("2026-09-12"), Date.parse("2026-09-12T00:00:00Z"));

  // New York moves its clocks forward on 8 March 2026 and back on 1 November 2026.
  const newYork = zonedCalendar("America/New_York");
  assert.equal(newYork.firstInstant("2026-03-09") - newYork.firstInstant("2026-03-08"), 23 * HOUR_MS);
  assert.equal(newYork.firstInstant("2026-11-02") - newYork.firstInstant("2026-11-01"), 25 * HOUR_MS);
});

test("a date window covers whole days in the timezone and ends with today", () => {
  const now = Date.parse("2026-09-11T23:30:00Z");
  assert.deepEqual(logicalDateWindow({ now, timeZone: "Asia/Ho_Chi_Minh", days: 7 }), {
    date: "2026-09-12",
    startMs: Date.parse("2026-09-05T17:00:00Z"),
    endMs: Date.parse("2026-09-12T17:00:00Z"),
  });
  assert.deepEqual(logicalDateWindow({ now, timeZone: "UTC", days: 1 }), {
    date: "2026-09-11",
    startMs: Date.parse("2026-09-11T00:00:00Z"),
    endMs: Date.parse("2026-09-12T00:00:00Z"),
  });
});

test("dates shift across month and year ends, and an unknown timezone falls back to UTC", () => {
  assert.equal(shiftDateKey("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDateKey("2026-12-31", 1), "2027-01-01");
  assert.equal(isValidTimeZone("Asia/Ho_Chi_Minh"), true);
  assert.equal(isValidTimeZone("Not/A_Timezone"), false);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(resolveTimeZone("Europe/London"), "Europe/London");
  assert.equal(resolveTimeZone("Not/A_Timezone"), "UTC");
  assert.equal(resolveTimeZone(null), "UTC");
});

test("a calendar reports the UTC offsets of a period and the moments they change", () => {
  const year = [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2027-01-01T00:00:00Z")] as const;
  assert.deepEqual(utcOffsetSegments(zonedCalendar("UTC"), ...year), [{ untilMs: null, offsetMs: 0 }]);
  assert.deepEqual(utcOffsetSegments(zonedCalendar("Asia/Ho_Chi_Minh"), ...year), [{ untilMs: null, offsetMs: 7 * HOUR_MS }]);
  // New York moves its clocks at 02:00 local time on 8 March and 1 November 2026.
  assert.deepEqual(utcOffsetSegments(zonedCalendar("America/New_York"), ...year), [
    { untilMs: Date.parse("2026-03-08T07:00:00Z"), offsetMs: -5 * HOUR_MS },
    { untilMs: Date.parse("2026-11-01T06:00:00Z"), offsetMs: -4 * HOUR_MS },
    { untilMs: null, offsetMs: -5 * HOUR_MS },
  ]);
  // Kathmandu is 5 hours 45 minutes ahead of UTC.
  assert.equal(zonedCalendar("Asia/Kathmandu").utcOffsetMs(Date.parse("2026-09-11T23:30:00.250Z")), 5.75 * HOUR_MS);
});

test("finding the offsets of a year takes few date conversions", () => {
  const original = Intl.DateTimeFormat.prototype.formatToParts;
  let conversions = 0;
  Intl.DateTimeFormat.prototype.formatToParts = function (date) {
    conversions++;
    return original.call(this, date);
  };
  try {
    utcOffsetSegments(zonedCalendar("America/New_York"), Date.parse("2026-01-01T00:00:00Z"), Date.parse("2027-01-01T00:00:00Z"));
  } finally {
    Intl.DateTimeFormat.prototype.formatToParts = original;
  }
  assert.ok(conversions < 150, `Expected a weekly sample and two searches; got ${conversions}`);
});
