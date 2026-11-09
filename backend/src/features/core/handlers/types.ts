/** Values that the HTTP app's first middleware stores for every request. */
export interface RequestEnvironment {
  Variables: {
    /** Identifies one request in the log and in the `X-Request-Id` header. */
    requestId: string;
    /** The caller's network address. Unset when the transport cannot tell. */
    clientAddress: string | undefined;
  };
}
