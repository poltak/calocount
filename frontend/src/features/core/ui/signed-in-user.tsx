import type { AuthEvents } from "../../auth/types.js";

/** What the protected layout in `routes.tsx` supplies to the page in its outlet. */
export interface ProtectedPageContext {
  user: { id: string };
  authEvents: AuthEvents;
}
