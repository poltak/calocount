import type { Profile } from "@app/common/features/core/utils/profile";
import type { AuthSession } from "../../auth/types.js";

/** Values that the HTTP app's first middleware stores for every request. */
export interface RequestEnvironment {
  Variables: {
    /** Identifies one request in the log and in the `X-Request-Id` header. */
    requestId: string;
    /** The caller's network address. Unset when the transport cannot tell. */
    clientAddress: string | undefined;
  };
}

/** The environment of a route behind the session gate and `resolveProfile`. */
export interface ProfileEnvironment {
  Variables: {
    /** Its `ownerKey` is the data key of `profile`. */
    session: AuthSession;
    profile: Profile;
    /** The key of the sign-in data. It is also the owner's data key. */
    accountKey: string;
  };
}
