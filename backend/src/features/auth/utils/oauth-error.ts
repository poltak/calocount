/** A refusal in the format of RFC 6749. The handler turns it into the JSON body of the OAuth endpoints. */
export class OAuthError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 413 | 429,
    readonly error: string,
    readonly description: string,
  ) {
    super(description);
    this.name = "OAuthError";
  }
}
