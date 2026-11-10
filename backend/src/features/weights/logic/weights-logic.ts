import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import { serialiseWeight, type DailyWeight } from "../utils/weight-view.js";

type WeightsProps = BackendLogicProps<"weights", "clock">;

/** The daily weights of the owner. */
export class WeightsLogic extends Logic<WeightsProps, Record<string, never>> {
  constructor(deps: WeightsProps) {
    super({ deps, initialState: {} });
  }

  async save({
    ownerKey,
    logicalDate,
    weightKg,
  }: {
    ownerKey: string;
    logicalDate: string;
    weightKg: number;
  }): Promise<DailyWeight> {
    const timestamp = this.deps.services.clock.now();
    const row = await this.deps.storage.weights.upsertDay({
      id: `weight_${crypto.randomUUID()}`,
      ownerKey,
      logicalDate,
      weightKg,
      recordedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return serialiseWeight(row);
  }

  /** The weight that the owner saved for this day, if any. */
  async day({
    ownerKey,
    date,
  }: {
    ownerKey: string;
    date: string;
  }): Promise<DailyWeight | undefined> {
    const row = await this.deps.storage.weights.findDay({ ownerKey, date });
    return row && serialiseWeight(row);
  }

  /** The weight that a goal per kilogram uses on this day: its own, or the latest one before it. */
  async latestOnOrBefore({
    ownerKey,
    date,
  }: {
    ownerKey: string;
    date: string;
  }): Promise<DailyWeight | undefined> {
    const row = await this.deps.storage.weights.findLatestOnOrBefore({
      ownerKey,
      date,
    });
    return row && serialiseWeight(row);
  }

  /** The earliest day with a weight. */
  firstDate({ ownerKey }: { ownerKey: string }): Promise<string | undefined> {
    return this.deps.storage.weights.findFirstDate({ ownerKey });
  }

  async range({
    ownerKey,
    from,
    to,
  }: {
    ownerKey: string;
    from: string;
    to: string;
  }): Promise<DailyWeight[]> {
    const rows = await this.deps.storage.weights.listRange({
      ownerKey,
      from,
      to,
    });
    return rows.map(serialiseWeight);
  }
}
