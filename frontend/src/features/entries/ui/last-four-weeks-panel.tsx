import { formatNumber } from "../../core/utils/dashboard-format.js";
import { useDashboard } from "./dashboard-context.js";

function formatGrams(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** Fat, saturated fat and fiber over the last 28 finished days. */
export function LastFourWeeksPanel() {
  const { dashboard } = useDashboard();
  const balance = dashboard.logic.fourWeekBalance;
  const previous = balance?.previousFatSharePercent ?? null;
  return (
    <section
      className="panel chart-panel last-four-weeks-panel"
      aria-labelledby="last-four-weeks-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Fat and fiber</p>
          <h2 id="last-four-weeks-title">Last 4 weeks</h2>
        </div>
      </div>
      {balance === null ? (
        <output className="chart-empty">
          <strong>Not enough logged days yet</strong>
          <span>Log at least 7 of the last 28 days to see this summary.</span>
        </output>
      ) : (
        <ul className="four-week-list">
          <li>
            <strong>{`Fat ${balance.fatSharePercent}% of calories`}</strong>
            {previous !== null && (
              <span>
                {balance.fatSharePercent === previous ? (
                  `same as ${previous}% in the 4 weeks before`
                ) : (
                  <>
                    <span aria-hidden="true">
                      {balance.fatSharePercent > previous ? "↑ " : "↓ "}
                    </span>
                    <span className="sr-only">
                      {balance.fatSharePercent > previous ? "up " : "down "}
                    </span>
                    {`from ${previous}% in the 4 weeks before`}
                  </>
                )}
              </span>
            )}
          </li>
          {balance.saturatedFat !== null && (
            <li>
              <strong>
                {`Saturated fat over the ${formatGrams(balance.saturatedFat.limitG)} g limit on ${balance.saturatedFat.daysOver} of ${balance.saturatedFat.loggedDays} logged days`}
              </strong>
            </li>
          )}
          <li>
            <strong>
              {balance.fiber.averageG === null
                ? "Fiber not recorded in these days"
                : `Fiber ${formatGrams(balance.fiber.averageG)} g a day`}
              {balance.fiber.goalG !== null &&
                ` · goal ${formatNumber(balance.fiber.goalG)} g`}
            </strong>
          </li>
        </ul>
      )}
    </section>
  );
}
