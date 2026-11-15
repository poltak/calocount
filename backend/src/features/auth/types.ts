/** The live session of a request. The owner is the only user. */
export interface AuthSession {
  ownerKey: string;
  /** The passkey that signed in, or `null` when its record is gone. */
  passkeyId: string | null;
  /** The session got a new end in this request, so the browser must get the cookie again. */
  renewed: boolean;
}
