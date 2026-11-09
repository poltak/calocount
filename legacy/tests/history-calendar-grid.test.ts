import assert from "node:assert/strict";
import test from "node:test";

import { calendarWeeks } from "../app/history-calendar-grid";

function dayNumbers(month: string) {
  return calendarWeeks(month).map((week) => week.map((cell) => cell?.dayOfMonth ?? null));
}

test("a calendar month is laid out in weeks that start on Monday", () => {
  // 1 September 2026 is a Tuesday.
  assert.deepEqual(dayNumbers("2026-09"), [
    [null, 1, 2, 3, 4, 5, 6],
    [7, 8, 9, 10, 11, 12, 13],
    [14, 15, 16, 17, 18, 19, 20],
    [21, 22, 23, 24, 25, 26, 27],
    [28, 29, 30, null, null, null, null],
  ]);
  assert.equal(calendarWeeks("2026-09")[1][5]?.date, "2026-09-12");
});

test("a calendar month has as many weeks as its days need", () => {
  // February 2027 starts on a Monday and has 28 days.
  assert.deepEqual(dayNumbers("2027-02"), [
    [1, 2, 3, 4, 5, 6, 7],
    [8, 9, 10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19, 20, 21],
    [22, 23, 24, 25, 26, 27, 28],
  ]);
  // 1 August 2026 is a Saturday, so the month needs six weeks.
  const august = dayNumbers("2026-08");
  assert.equal(august.length, 6);
  assert.deepEqual(august[0], [null, null, null, null, null, 1, 2]);
  assert.deepEqual(august[5], [31, null, null, null, null, null, null]);
  // A leap year has 29 days in February.
  assert.equal(calendarWeeks("2028-02").flat().filter(Boolean).at(-1)?.date, "2028-02-29");
});
