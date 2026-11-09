import { useOutletContext } from "react-router";
import type { AuthEvents } from "../../auth/types.js";

/** What the protected layout in `routes.tsx` supplies to the page in its outlet. */
export interface ProtectedPageContext {
  user: { id: string };
  authEvents: AuthEvents;
}

export function useSignedInUser(): ProtectedPageContext["user"] {
  return useOutletContext<ProtectedPageContext>().user;
}

/**
 * The events of the session's Logic. A page gives them to its own Logic in
 * `deps`. It cannot read them from the auth provider, which is private to the
 * auth feature.
 */
export function useAuthEvents(): AuthEvents {
  return useOutletContext<ProtectedPageContext>().authEvents;
}
