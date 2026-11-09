/** The live session of a request. The owner is the only user. */
export interface AuthSession {
  ownerKey: string;
  /** The passkey that signed in, or `null` when its record is gone. */
  passkeyId: string | null;
}
