import { Hono } from "hono";
import { z } from "zod";
import type { BackendLogic } from "../../core/types.js";
import type { RequestEnvironment } from "../../core/handlers/types.js";
import { validator } from "../../core/handlers/validator.js";
import { applySessionCookies } from "./session-cookies.js";

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(200),
  email: z.string().trim().pipe(z.email()),
  // The auth SDK accepts a password of 8 to 128 characters.
  password: z.string().min(8).max(128),
});

interface SignUpHandlerProps {
  logic: Pick<BackendLogic, "authSignUp">;
}

export function createSignUpHandlers({ logic }: SignUpHandlerProps) {
  return new Hono<RequestEnvironment>()
    .get("/", (context) => context.json(logic.authSignUp.getStatus()))
    .post("/", validator("json", signUpSchema), async (context) => {
      const { user, responseHeaders } = await logic.authSignUp.signUp({
        ...context.req.valid("json"),
        requestHeaders: context.req.raw.headers,
        clientAddress: context.get("clientAddress"),
      });
      applySessionCookies(context, responseHeaders);
      return context.json({ user }, 201);
    });
}
