/** Minimal same-origin cookie transport for in-process application tests. */
export function createBrowserTransport({
  fetch,
  origin,
}: {
  fetch: typeof globalThis.fetch;
  origin: string;
}): typeof globalThis.fetch {
  const cookies = new Map<string, { value: string; expiresAt: number }>();
  return async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).origin !== origin) {
      throw new Error(
        "In-memory browser transport accepts only its configured origin",
      );
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
    if (useCookies) {
      for (const value of response.headers.getSetCookie()) {
        const [pair, ...attributes] = value.split(";");
        const separator = pair.indexOf("=");
        const name = pair.slice(0, separator);
        const content = pair.slice(separator + 1);
        let expiresAt = Infinity;
        for (const attribute of attributes) {
          const [key, ...parts] = attribute.trim().split("=");
          if (key.toLowerCase() === "max-age") {
            expiresAt = Date.now() + Number(parts.join("=")) * 1000;
          } else if (
            key.toLowerCase() === "expires" &&
            expiresAt === Infinity
          ) {
            expiresAt = Date.parse(parts.join("="));
          }
        }
        if (!content || expiresAt <= Date.now()) {
          cookies.delete(name);
        } else {
          cookies.set(name, { value: content, expiresAt });
        }
      }
    }
    return response;
  };
}
