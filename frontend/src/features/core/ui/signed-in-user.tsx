import { useOutletContext } from "react-router";

/** What each page behind the session gate knows about the signed-in user. */
export interface SignedInUser {
  id: string;
}

/**
 * The signed-in user, for a page behind the session gate. The protected layout
 * in `routes.tsx` supplies it to its outlet.
 */
export function useSignedInUser(): SignedInUser {
  return useOutletContext<SignedInUser>();
}
