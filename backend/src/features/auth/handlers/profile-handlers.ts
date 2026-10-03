import { Hono } from "hono";
import { z } from "zod";
import type { BackendLogic } from "../../core/types.js";
import { validator } from "../../core/handlers/validator.js";
import type { AuthEnvironment } from "./types.js";

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(200),
});

interface ProfileHandlerProps {
  logic: Pick<BackendLogic, "authProfile">;
}

/** Routes for the signed-in user's own profile. Mount them behind the session gate. */
export function createProfileHandlers({ logic }: ProfileHandlerProps) {
  return new Hono<AuthEnvironment>()
    .get("/", (context) => {
      const { id, email, name } = context.get("auth").user;
      return context.json({ user: { id, email, name } });
    })
    .patch("/", validator("json", updateProfileSchema), async (context) => {
      const user = await logic.authProfile.updateName({
        ...context.req.valid("json"),
        user: context.get("auth").user,
        requestHeaders: context.req.raw.headers,
      });
      return context.json({ user });
    });
}
