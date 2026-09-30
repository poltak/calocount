import type { AuthSession } from "../services/types.js";

/** Verified identity is scoped to a single HTTP request. */
export interface AuthEnvironment {
  Variables: { auth: AuthSession };
}
