import { Hono } from "hono";
import { z } from "zod";
import type { BackendLogic } from "../../core/types.js";
import type { RequestEnvironment } from "../../core/handlers/types.js";
import { validator } from "../../core/handlers/validator.js";
import { applySessionCookies } from "./session-cookies.js";

const signInSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(1, "Enter your password"),
});

interface SessionHandlerProps {
  logic: Pick<BackendLogic, "authSession">;
}

/** Public routes that start and end the caller's session. */
export function createSessionHandlers({ logic }: SessionHandlerProps) {
  return new Hono<RequestEnvironment>()
    .post("/", validator("json", signInSchema), async (context) => {
      const { user, responseHeaders } = await logic.authSession.signIn({
        ...context.req.valid("json"),
        requestHeaders: context.req.raw.headers,
        clientAddress: context.get("clientAddress"),
      });
      applySessionCookies(context, responseHeaders);
      return context.json({ user });
    })
    .delete("/", async (context) => {
      const { responseHeaders } = await logic.authSession.signOut({
        requestHeaders: context.req.raw.headers,
        clientAddress: context.get("clientAddress"),
      });
      applySessionCookies(context, responseHeaders);
      return context.body(null, 204);
    });
}
