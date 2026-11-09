/**
 * Test-only routes for the black-box tests in `frontend/`. They answer only
 * when CALOCOUNT_BLACK_BOX is "true". Only `scripts/black-box-serve.mjs` sets
 * it, on a local Worker with a database of its own.
 */

const RESET_PATH = "/api/__black-box/reset";

type BlackBoxEnv = Env & { CALOCOUNT_BLACK_BOX?: string };

/** Delete each row of each app table, and each stored photo. */
async function resetInstance(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
  ).all<{ name: string }>();
  // A batch is one transaction, so the foreign keys are checked at its end.
  await env.DB.batch([
    env.DB.prepare("PRAGMA defer_foreign_keys = on"),
    ...results.map(({ name }) => env.DB.prepare(`DELETE FROM "${name.replaceAll('"', '""')}"`)),
  ]);
  let cursor: string | undefined;
  do {
    const listed = await env.PHOTOS.list(cursor ? { cursor } : {});
    if (listed.objects.length > 0) await env.PHOTOS.delete(listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

/** The response of a test-only route, or null when the request is not for one. */
export async function handleBlackBoxRoute(request: Request, pathname: string, env: Env): Promise<Response | null> {
  if ((env as BlackBoxEnv).CALOCOUNT_BLACK_BOX !== "true" || pathname !== RESET_PATH) return null;
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  await resetInstance(env);
  return new Response(null, { status: 204 });
}
