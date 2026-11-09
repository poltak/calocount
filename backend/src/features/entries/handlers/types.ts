import type { AuthSession } from "../../auth/types.js";

/** The environment of a route behind the session gate. */
export interface SessionEnvironment {
  Variables: { session: AuthSession };
}
