import { performance } from "node:perf_hooks";
import { getDashboardSummary } from "../db/repository";
import { createSqliteTestDb } from "../tests/helpers/sqlite-db";

// Synthetic data in memory. No Worker bindings or saved database are accessed.
const ownerKey = "audit-owner";
const now = new Date("2026-09-12T12:00:00Z");
const samplesPerSize = 15;
const originalFormatToParts = Intl.DateTimeFormat.prototype.formatToParts;
let formatCalls = 0;

Intl.DateTimeFormat.prototype.formatToParts = function (date) {
  formatCalls++;
  return originalFormatToParts.call(this, date);
};

try {
  console.log(JSON.stringify({ node: process.version, samplesPerSize, warmups: 3, timezone: "Asia/Ho_Chi_Minh" }));
  for (const mealCount of [90, 500]) {
    const fixture = createSqliteTestDb();
    try {
      fixture.sqlite.exec("INSERT INTO settings (id, owner_key, daily_calorie_target, daily_protein_target_g) VALUES ('audit-settings', 'audit-owner', 2000, 150)");
      const meal = fixture.sqlite.prepare("INSERT INTO meal_logs (id, owner_key, consumed_at, source, caption, status, photo_key, photo_mime_type, total_calories, total_protein_g, total_carbs_g, total_fat_g) VALUES (?, ?, ?, 'dashboard', ?, 'complete', ?, 'image/jpeg', 500, 30, 50, 20)");
      const item = fixture.sqlite.prepare("INSERT INTO meal_items (id, meal_id, owner_key, name, calories, protein_g, carbs_g, fat_g, fiber_g) VALUES (?, ?, ?, 'Audit meal', 500, 30, 50, 20, 4)");
      fixture.sqlite.exec("BEGIN");
      for (let index = 0; index < mealCount; index++) {
        const id = `meal-${index}`;
        const consumedAt = now.getTime() - (index % 30) * 86_400_000 - index;
        meal.run(id, ownerKey, consumedAt, id, `meals/${ownerKey}/${id}.jpg`);
        item.run(`item-${index}`, id, ownerKey);
      }
      fixture.sqlite.exec("COMMIT");
      for (let index = 0; index < 3; index++) await getDashboardSummary(fixture.db, ownerKey, { now, timezone: "Asia/Ho_Chi_Minh" });
      const samples: number[] = [];
      formatCalls = 0;
      fixture.queries.length = 0;
      for (let index = 0; index < samplesPerSize; index++) {
        const start = performance.now();
        await getDashboardSummary(fixture.db, ownerKey, { now, timezone: "Asia/Ho_Chi_Minh" });
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      console.log(JSON.stringify({ mealCount, medianMs: Number(samples[7].toFixed(2)), dateConversions: formatCalls / samplesPerSize, queries: fixture.queries.length / samplesPerSize }));
    } finally {
      fixture.sqlite.close();
    }
  }
} finally {
  Intl.DateTimeFormat.prototype.formatToParts = originalFormatToParts;
}
