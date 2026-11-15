import type { AuthSession } from "../../auth/types.js";
import type { PhotoUpload } from "../utils/meal-photo.js";

/** The environment of a route behind the session gate. */
export interface SessionEnvironment {
  Variables: { session: AuthSession };
}

/** The environment of a route that takes an entry with an optional photo. */
export interface EntryRequestEnvironment {
  Variables: { session: AuthSession; photo: PhotoUpload | null };
}
