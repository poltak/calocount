import { describe, expect, it } from "vitest";
import { LatestRequest } from "./latest-request.js";

describe("LatestRequest", () => {
  it("cancels the previous request when a new one starts", () => {
    const requests = new LatestRequest(new AbortController().signal);
    const first = requests.start();
    const second = requests.start();

    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it("cancels the request in flight on demand", () => {
    const requests = new LatestRequest(new AbortController().signal);
    const signal = requests.start();
    requests.cancel();

    expect(signal.aborted).toBe(true);
  });

  it("cancels current and later requests when the owner tears down", () => {
    const owner = new AbortController();
    const requests = new LatestRequest(owner.signal);
    const signal = requests.start();
    owner.abort();

    expect(signal.aborted).toBe(true);
    expect(requests.start().aborted).toBe(true);
  });
});
