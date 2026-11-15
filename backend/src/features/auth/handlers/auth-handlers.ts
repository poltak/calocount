import { Hono } from "hono";
import { z } from "zod";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import { relyingPartyOf } from "../utils/relying-party.js";
import { requireSession } from "./require-session.js";
import { clearedSessionCookie, sessionCookie } from "./session-cookies.js";
import type { AuthEnvironment } from "./types.js";

/** The browser sends the challenge ID back with its answer. */
const challengeIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{20,100}$/, "challengeId is not valid.");

/** The service checks the rest of the answer, and keeps every field. */
const answerSchema = z.custom<{ id: string }>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string",
  "response must be a passkey response.",
);

const registerOptionsSchema = z.object({
  // `AuthPasskeyLogic` checks the type and the length, as the old app did.
  setupCode: z.unknown().optional(),
});

const verifySchema = z.object({
  challengeId: challengeIdSchema,
  response: answerSchema,
});

interface AuthHandlerProps {
  logic: Pick<
    BackendLogic,
    "authConnections" | "authPasskey" | "authPasskeyManage" | "authSession"
  >;
}

/**
 * The sign-in routes. Mount them behind `resolveSession`. The status, setup,
 * sign-in and sign-out routes work without a session. The passkey list and
 * the removal need one.
 */
export function createAuthHandlers({ logic }: AuthHandlerProps) {
  return (
    new Hono<AuthEnvironment>()
      .get("/status", async (context) =>
        context.json(
          await logic.authPasskey.status({
            signedIn: context.get("session") !== null,
          }),
          200,
        ),
      )
      .post(
        "/register/options",
        validator("json", registerOptionsSchema),
        async (context) =>
          context.json(
            await logic.authPasskey.startRegistration({
              relyingParty: relyingPartyOf({ requestUrl: context.req.url }),
              signedIn: context.get("session") !== null,
              setupCode: context.req.valid("json").setupCode,
              clientAddress: context.get("clientAddress"),
            }),
            200,
          ),
      )
      .post(
        "/register/verify",
        validator("json", verifySchema),
        async (context) => {
          const { challengeId, response } = context.req.valid("json");
          const { passkey, sessionToken } =
            await logic.authPasskey.finishRegistration({
              relyingParty: relyingPartyOf({ requestUrl: context.req.url }),
              signedIn: context.get("session") !== null,
              challengeId,
              answer: response,
              userAgent: context.req.header("user-agent") ?? "",
            });
          if (sessionToken) {
            context.header(
              "set-cookie",
              sessionCookie({
                url: new URL(context.req.url),
                token: sessionToken,
              }),
            );
          }
          return context.json({ passkey }, 201);
        },
      )
      .post("/login/options", async (context) =>
        context.json(
          await logic.authPasskey.startSignIn({
            relyingParty: relyingPartyOf({ requestUrl: context.req.url }),
          }),
          200,
        ),
      )
      .post(
        "/login/verify",
        validator("json", verifySchema),
        async (context) => {
          const { challengeId, response } = context.req.valid("json");
          const { sessionToken } = await logic.authPasskey.finishSignIn({
            relyingParty: relyingPartyOf({ requestUrl: context.req.url }),
            challengeId,
            answer: response,
          });
          context.header(
            "set-cookie",
            sessionCookie({
              url: new URL(context.req.url),
              token: sessionToken,
            }),
          );
          return context.json({ signedIn: true as const }, 200);
        },
      )
      // It works without a live session, so an expired cookie also goes.
      .post("/logout", async (context) => {
        const token = context.get("sessionToken");
        if (token) {
          await logic.authSession.endSession({ token });
        }
        context.header(
          "set-cookie",
          clearedSessionCookie({ url: new URL(context.req.url) }),
        );
        return context.json({ signedIn: false as const }, 200);
      })
      .get("/passkeys", requireSession(), async (context) => {
        return context.json(
          {
            passkeys: await logic.authPasskeyManage.list({
              session: context.get("session"),
            }),
          },
          200,
        );
      })
      .delete("/passkeys/:id", requireSession(), async (context) => {
        const result = await logic.authPasskeyManage.remove({
          session: context.get("session"),
          id: context.req.param("id"),
        });
        if (result.signedOut) {
          context.header(
            "set-cookie",
            clearedSessionCookie({ url: new URL(context.req.url) }),
          );
        }
        return context.json(result, 200);
      })
      .get("/connections", requireSession(), async (context) => {
        return context.json(
          {
            connections: await logic.authConnections.list({
              ownerKey: context.get("session").ownerKey,
            }),
          },
          200,
        );
      })
      .delete("/connections/:id", requireSession(), async (context) => {
        await logic.authConnections.remove({
          ownerKey: context.get("session").ownerKey,
          id: context.req.param("id"),
        });
        return context.json({ removed: true as const }, 200);
      })
  );
}
