/**
 * Keeps only the newest request of one kind, such as repeated session checks.
 * Starting a request cancels the previous one, so an older response cannot
 * overwrite newer state. Requests also stop when the owning Logic cleans up.
 */
export class LatestRequest {
  private controller: AbortController | undefined;

  constructor(private readonly ownerSignal: AbortSignal) {}

  /** Cancel the previous request and return the signal for a new one. */
  start(): AbortSignal {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    return AbortSignal.any([this.ownerSignal, controller.signal]);
  }

  /** Cancel the request in flight, if there is one. */
  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
  }
}
