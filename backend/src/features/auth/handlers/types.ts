import type { RequestEnvironment } from "../../core/handlers/types.js";
import type { AuthSession } from "../types.js";

/** Set by `resolveSession` for each request under `/api`. */
export interface AuthEnvironment {
  Variables: RequestEnvironment["Variables"] & {
    /** `null` when the request has no cookie, or its session is not live. */
    session: AuthSession | null;
    /** The token in the session cookie, valid or not. */
    sessionToken: string | null;
  };
}
