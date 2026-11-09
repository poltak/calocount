import { getExportData } from "../../../db/repository";
import { getRequestDb, requireApiIdentity, withApiErrors } from "../_lib/http";
import { buildExportResponse } from "../_lib/export";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const format = new URL(request.url).searchParams.get("format")?.toLowerCase() ?? "json";
    return buildExportResponse({
      format,
      loadData: () => getExportData({ db: getRequestDb(), ownerKey: identity.ownerKey }),
    });
  });
}
