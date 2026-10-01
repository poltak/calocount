import { Hono, type Context } from "hono";
import { z } from "zod";
import type { BackendLogic } from "../../core/types.js";
import { validator } from "../../core/handlers/validator.js";

const signInSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(1),
});

interface SessionHandlerProps {
  logic: Pick<BackendLogic, "authSession">;
}

function applyResponseHeaders(context: Context, headers: Headers): void {
  for (const cookie of headers.getSetCookie()) {
    context.header("set-cookie", cookie, { append: true });
  }
}

/** Public routes that start and end the caller's session. */
export function createSessionHandlers({ logic }: SessionHandlerProps) {
  return new Hono()
    .post("/", validator("json", signInSchema), async (context) => {
      const { user, responseHeaders } = await logic.authSession.signIn({
        ...context.req.valid("json"),
        requestHeaders: context.req.raw.headers,
      });
      applyResponseHeaders(context, responseHeaders);
      return context.json({ user });
    })
    .delete("/", async (context) => {
      const { responseHeaders } = await logic.authSession.signOut({
        requestHeaders: context.req.raw.headers,
      });
      applyResponseHeaders(context, responseHeaders);
      return context.body(null, 204);
    });
}
