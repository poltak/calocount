import { setupCodeState } from "../../../auth/passkeys";
import { countPasskeys } from "../../../auth/store";
import {
  configuredAuthMode,
  configuredOwnerKey,
  getRequestDb,
  isLocalAuth,
  jsonResponse,
  readSession,
  withApiErrors,
} from "../../_lib/http";
import { getEnvValue } from "../../../../db";

/** What the sign-in page needs: the sign-in method, and whether this browser and this instance are set up. */
export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    if (isLocalAuth()) return jsonResponse({ mode: "local" });
    if (configuredAuthMode() === "access") return jsonResponse({ mode: "access" });
    const db = getRequestDb();
    const [session, passkeys] = await Promise.all([
      readSession(request),
      countPasskeys({ db, ownerKey: configuredOwnerKey() }),
    ]);
    return jsonResponse({
      mode: "passkey",
      signedIn: session !== null,
      hasPasskeys: passkeys > 0,
      setupCode: setupCodeState(getEnvValue("CALOCOUNT_SETUP_CODE")),
    });
  });
}
