import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("all trend panels share the seven or thirty day range", async () => {
  const [page, nutrientPanel, selector, css, repository] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nutrition/nutrient-trend-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/trend-range-select.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/repository.ts", import.meta.url), "utf8"),
  ]);

  assert.match(selector, /Past 7 days/);
  assert.match(selector, /Past 30 days/);
  assert.equal((page.match(/value=\{trendRange\} onChange=\{setTrendRange\}/g) ?? []).length, 3);
  assert.match(page, /range=\{trendRange\} onRangeChange=\{setTrendRange\}/);
  assert.match(nutrientPanel, /<TrendRangeSelect value=\{range\}/);
  assert.match(page, /source\.slice\(-trendRange\)/);
  assert.match(page, /sevenDayChartValues/);
  assert.match(page, /className="weight-line"/);
  assert.match(css, /\.weight-line polyline/);
  assert.match(css, /\.bar-chart\.is-month/);
  assert.match(css, /\.macro-trend-chart\.is-month/);
  assert.match(css, /\.nutrient-trend-chart\.is-month/);
  assert.match(css, /\.nutrient-trend-chart\.is-month \.nutrient-trend-column > span:last-child/);
  assert.match(css, /width: max-content/);
  assert.match(css, /\.nutrient-trend-chart\.is-month \.nutrient-trend-gap \{ visibility: hidden; \}/);
  assert.match(css, /\.nutrient-trend-column[\s\S]*padding: 0 0 21px/);
  assert.match(css, /\.nutrient-trend-column > span:last-child[\s\S]*position: absolute/);
  assert.match(css, /\.nutrient-trend-chart\.is-month \.nutrient-trend-bar[\s\S]*width: min\(8px, 72%\)/);
  assert.match(repository, /Array\.from\(\{ length: 30 \}/);
  assert.match(page, /<button className="bar-column" key=\{day\.date\} type="button"/);
  assert.match(page, /className="macro-tooltip"/);
  assert.match(nutrientPanel, /<button className=\{`nutrient-trend-column/);
  assert.match(css, /\.bar-column:focus \.bar-value/);
  assert.match(css, /\.nutrient-trend-column:focus \.bar-value/);
  assert.match(css, /\.macro-trend-column:focus \.macro-tooltip/);
});
