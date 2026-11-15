import { APP_NAME } from "@app/common/features/core/utils/app-name";
import type { RelyingParty } from "../services/types.js";

/**
 * The relying party comes from the request URL, as in the old app: a passkey
 * made on one host name does not work on another.
 */
export function relyingPartyOf({
  requestUrl,
}: {
  requestUrl: string;
}): RelyingParty {
  const url = new URL(requestUrl);
  return { rpId: url.hostname, rpName: APP_NAME, origin: url.origin };
}
