import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import {
  formatNutrientAmount,
  nutrientLabel,
  nutrientUnit,
} from "../utils/nutrient-format.js";

export interface NutrientTotal {
  amount: number | null;
  knownItemCount: number;
  totalItemCount: number;
  complete: boolean;
}

function coverageLabel(total: NutrientTotal): string {
  if (total.amount === null) {
    return "Unknown";
  }
  return total.complete
    ? "Complete"
    : `Partial · ${total.knownItemCount} of ${total.totalItemCount} items`;
}

/** One nutrient of a day: its amount, and whether every item had a value for it. */
export function NutrientStat({
  nutrientKey,
  label,
  total,
  showCoverage = true,
  className = "",
}: {
  nutrientKey: NutrientKey;
  label?: string;
  total: NutrientTotal | undefined;
  showCoverage?: boolean;
  className?: string;
}) {
  const formatted = formatNutrientAmount(total?.amount, nutrientKey);
  const partial = Boolean(total && total.amount !== null && !total.complete);
  return (
    <div className={`nutrient-stat ${className}`.trim()}>
      <span className="nutrient-stat-label">
        {label ?? nutrientLabel(nutrientKey)}
      </span>
      <span
        className={partial ? "nutrient-value is-partial" : "nutrient-value"}
      >
        <span className="nutrient-value-reading">
          <strong>{formatted}</strong>
          {formatted !== "—" && <small>{nutrientUnit(nutrientKey)}</small>}
        </span>
        {showCoverage && partial && total && (
          <em
            title={`${total.knownItemCount} of ${total.totalItemCount} items have a value`}
          >
            {coverageLabel(total)}
          </em>
        )}
        {showCoverage && formatted === "—" && (
          <em>{`${nutrientLabel(nutrientKey)} unknown`}</em>
        )}
      </span>
    </div>
  );
}
