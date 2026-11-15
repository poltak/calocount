interface HeldRequest {
  /** Resolves when a request has arrived at the hold. */
  reached: Promise<void>;
  release(): void;
}

export interface BrowserTransport {
  fetch: typeof globalThis.fetch;
  /** Hold the next request before the backend receives it. */
  holdNextRequest(): HeldRequest;
  /** Let the backend handle the next request, then hold its response. */
  holdNextResponse(): HeldRequest;
  /** Fail every request, as a browser does without a connection. */
  goOffline(): void;
  goOnline(): void;
  /**
   * Answer the next request with a plain-text failure before the backend
   * receives it, as a proxy or gateway in front of the backend does.
   */
  failNextRequestAtGateway(status: 401 | 502 | 503 | 504): void;
}

interface Hold {
  stage: "request" | "response";
  reach(): void;
  released: Promise<void>;
}

export function createBrowserTransport({
  fetch,
  origin,
  setCookies = [],
}: {
  fetch: typeof globalThis.fetch;
  origin: string;
  /** `Set-Cookie` values that the browser has before its first request. */
  setCookies?: string[];
}): BrowserTransport {
  const cookies = new Map<string, { value: string; expiresAt: number }>();
  const holds: Hold[] = [];
  const gatewayFailures: number[] = [];
  let offline = false;

  const storeCookie = (setCookie: string) => {
    const [pair = "", ...attributes] = setCookie.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const content = pair.slice(separator + 1);
    let expiresAt = Infinity;
    for (const attribute of attributes) {
      const [key = "", ...parts] = attribute.trim().split("=");
      if (key.toLowerCase() === "max-age") {
        expiresAt = Date.now() + Number(parts.join("=")) * 1000;
      } else if (key.toLowerCase() === "expires" && expiresAt === Infinity) {
        expiresAt = Date.parse(parts.join("="));
      }
    }
    if (!content || expiresAt <= Date.now()) {
      cookies.delete(name);
    } else {
      cookies.set(name, { value: content, expiresAt });
    }
  };
  setCookies.forEach(storeCookie);

  const hold = (stage: Hold["stage"]): HeldRequest => {
    let reach!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => {
      reach = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    holds.push({ stage, reach, released });
    return { reached, release };
  };

  /** A held request still fails at once when its caller cancels it. */
  const waitForRelease = async (held: Hold, signal: AbortSignal) => {
    held.reach();
    let abort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
    });
    signal.addEventListener("abort", abort);
    try {
      await Promise.race([held.released, aborted]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };

  const send: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).origin !== origin) {
      throw new Error(
        "In-memory browser transport accepts only its configured origin",
      );
    }
    request.signal.throwIfAborted();
    if (offline) {
      throw new TypeError("Failed to fetch");
    }
    const gatewayFailure = gatewayFailures.shift();
    if (gatewayFailure) {
      return new Response("The service is unavailable", {
        status: gatewayFailure,
        headers: { "content-type": "text/plain" },
      });
    }
    const held = holds.shift();
    if (held?.stage === "request") {
      await waitForRelease(held, request.signal);
    }

    const headers = new Headers(request.headers);
    const useCookies = request.credentials !== "omit";
    if (useCookies && !headers.has("cookie")) {
      const values: string[] = [];
      for (const [name, cookie] of cookies) {
        if (cookie.expiresAt <= Date.now()) {
          cookies.delete(name);
        } else {
          values.push(`${name}=${cookie.value}`);
        }
      }
      if (values.length) {
        headers.set("cookie", values.join("; "));
      }
    }
    if (!["GET", "HEAD"].includes(request.method) && !headers.has("origin")) {
      headers.set("origin", origin);
    }
    const response = await fetch(new Request(request, { headers }));
    if (held?.stage === "response") {
      await waitForRelease(held, request.signal);
    }
    if (useCookies) {
      response.headers.getSetCookie().forEach(storeCookie);
    }
    return response;
  };

  return {
    fetch: send,
    holdNextRequest: () => hold("request"),
    holdNextResponse: () => hold("response"),
    goOffline: () => {
      offline = true;
    },
    goOnline: () => {
      offline = false;
    },
    failNextRequestAtGateway: (status) => {
      gatewayFailures.push(status);
    },
  };
}
