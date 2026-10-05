import { useOutletContext } from "react-router";

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
