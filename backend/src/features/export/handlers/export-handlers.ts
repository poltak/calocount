import { Hono } from "hono";
import type { BackendLogic } from "../../core/types.js";
import type { SessionEnvironment } from "../../entries/handlers/types.js";
import { exportStream } from "../utils/export-format.js";

interface ExportHandlerProps {
  logic: Pick<BackendLogic, "entryReads" | "settings" | "weights">;
}

function withoutOwnerKey<Row extends { ownerKey: string }>(row: Row) {
  const { ownerKey, ...rest } = row;
  void ownerKey;
  return rest;
}

/** The download of everything the owner saved, as JSON or CSV. */
export function createExportHandlers({ logic }: ExportHandlerProps) {
  return new Hono<SessionEnvironment>().get("/", async (context) => {
    const format =
      new URL(context.req.url).searchParams.get("format")?.toLowerCase() ??
      "json";
    if (format !== "json" && format !== "csv") {
      context.header("cache-control", "no-store");
      return context.json(
        {
          error: {
            code: "invalid_format" as const,
            message: "format must be json or csv.",
          },
        },
        400,
      );
    }
    const { ownerKey } = context.get("session");
    const [everything, settings, weights, goalChanges] = await Promise.all([
      logic.entryReads.everything({ ownerKey }),
      logic.settings.read({ ownerKey }),
      logic.weights.range({
        ownerKey,
        from: "0000-01-01",
        to: "9999-12-31",
      }),
      logic.settings.goalChanges({ ownerKey, limit: Number.MAX_SAFE_INTEGER }),
    ]);
    return new Response(
      exportStream({
        format,
        exportedAt: new Date(everything.exportedAt),
        data: {
          entries: everything.entries,
          settings: settings ? withoutOwnerKey(settings) : null,
          // Newest first, as the old export had them.
          weights: weights.toReversed(),
          goalChanges: goalChanges.toReversed().map(withoutOwnerKey),
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
          "content-type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="calocount-export.${format}"`,
        },
      },
    );
  });
}
