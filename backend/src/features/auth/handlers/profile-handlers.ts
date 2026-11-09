import { Hono } from "hono";
import type { AuthEnvironment } from "./types.js";

/** Mount it behind the session gate, which sets the user that it returns. */
export function createProfileHandlers() {
  return new Hono<AuthEnvironment>().get("/", (context) => {
    const { id, email, name } = context.get("auth").user;
    return context.json({ user: { id, email, name } });
  });
}
