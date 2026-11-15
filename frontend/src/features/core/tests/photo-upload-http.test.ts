import { describe, expect, it } from "vitest";
import { pngFile, seedEntry } from "../../entries/ui/entry-test-helpers.js";
import { createFullApplication } from "./full-application.js";

const ORIGIN = "http://app.test";
const MEBIBYTE = 1024 * 1024;

const ENTRY = { caption: "Soup", items: [{ name: "Soup", calories: 200 }] };

function form(fields: Record<string, string | File>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

/** A body with no `Content-Length`, which the server must count as it reads. */
function streamedBody(chunks: Uint8Array[]) {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[sent];
      sent += 1;
      if (chunk) {
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
  });
  return { body: stream, duplex: "half" };
}

// The calls that a page cannot make: a malformed form, a body that lies about
// its size, a save that fails after the upload, and a key of another owner.
// They go through the transport of the frontend, so the whole backend runs.
describe("photo upload over HTTP", () => {
  it("should remove the new object when the entry cannot be saved", async () => {
    const app = await createFullApplication();
    const id = await seedEntry(app, { name: "First" });

    const response = await app.transport.fetch(`${ORIGIN}/api/meals`, {
      method: "POST",
      // The ID of a saved entry fails the insert, after the upload.
      body: form({
        payload: JSON.stringify({ ...ENTRY, id }),
        photo: pngFile(),
      }),
    });

    expect(response.status).toEqual(500);
    expect(app.backend.photoBucket.keys()).toEqual([]);
    expect(
      await app.backend.db.selectFrom("mealLogs").select("id").execute(),
    ).toEqual([{ id }]);
  });

  it("should store nothing for a request that fails its checks", async () => {
    const app = await createFullApplication();
    const id = await seedEntry(app, { name: "First" });
    const send = (method: string, path: string, body: FormData) =>
      app.transport.fetch(`${ORIGIN}${path}`, { method, body });

    const invalid = await send(
      "POST",
      "/api/meals",
      form({
        payload: JSON.stringify({ items: [{ name: "" }] }),
        photo: pngFile(),
      }),
    );
    expect(invalid.status).toEqual(400);

    const missing = await send(
      "PATCH",
      "/api/meals/not-there",
      form({ payload: "{}", photo: pngFile() }),
    );
    expect(missing.status).toEqual(404);

    const notObject = await send(
      "PATCH",
      `/api/meals/${id}`,
      form({ payload: "[]", photo: pngFile() }),
    );
    expect(notObject.status).toEqual(400);

    expect(app.backend.photoBucket.keys()).toEqual([]);
  });

  it("should keep the entry and its photo when the bucket cannot take the new photo", async () => {
    const app = await createFullApplication();
    const id = await seedEntry(app, { name: "First", photo: pngFile() });
    const [before] = app.backend.photoBucket.keys();
    app.backend.photoBucket.failNext("put");

    const response = await app.transport.fetch(`${ORIGIN}/api/meals/${id}`, {
      method: "PATCH",
      body: form({ payload: "{}", photo: pngFile() }),
    });

    expect(response.status).toEqual(500);
    expect(app.backend.photoBucket.keys()).toEqual([before]);
    expect(
      await app.backend.db.selectFrom("mealLogs").select("photoKey").execute(),
    ).toEqual([{ photoKey: before }]);
  });

  it("should refuse a malformed form, a wrong content type and a body over the limit", async () => {
    const app = await createFullApplication();
    const post = (init: RequestInit) =>
      app.transport.fetch(`${ORIGIN}/api/meals`, { method: "POST", ...init });
    const multipart = { "content-type": "multipart/form-data; boundary=calo" };

    const malformed = await post({
      headers: multipart,
      body: "not a multipart form",
    });
    expect(malformed.status).toEqual(400);

    const mismatch = await post({
      body: form({
        payload: JSON.stringify(ENTRY),
        photo: new File([new Uint8Array([1, 2, 3])], "a.png", {
          type: "image/png",
        }),
      }),
    });
    expect(mismatch.status).toEqual(415);
    expect(await mismatch.json()).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });

    const tooBig = await post({
      body: form({
        payload: JSON.stringify(ENTRY),
        photo: new File([new Uint8Array(10 * MEBIBYTE + 1)], "a.png", {
          type: "image/png",
        }),
      }),
    });
    expect(tooBig.status).toEqual(413);

    // Counted as it is read: no `Content-Length`, and 12 MiB in 1 MiB chunks.
    const streamed = await post({
      headers: multipart,
      ...streamedBody(
        Array.from({ length: 12 }, () => new Uint8Array(MEBIBYTE)),
      ),
    });
    expect(streamed.status).toEqual(413);

    // A JSON body keeps the small limit of the other routes.
    const bigJson = await post({
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...ENTRY, caption: "x".repeat(200 * 1024) }),
    });
    expect(bigJson.status).toEqual(413);

    expect(app.backend.photoBucket.keys()).toEqual([]);
    expect(
      await app.backend.db.selectFrom("mealLogs").selectAll().execute(),
    ).toEqual([]);
  });

  it("should send the photo only to the owner whose entry uses it", async () => {
    const app = await createFullApplication();
    const id = await seedEntry(app, { name: "First", photo: pngFile() });
    const [key] = app.backend.photoBucket.keys();
    const address = `${ORIGIN}/api/photos/${key}`;

    const own = await app.transport.fetch(address);
    expect(own.status).toEqual(200);
    expect(own.headers.get("content-type")).toEqual("image/png");

    const etag = own.headers.get("etag") ?? "";
    const revalidated = await app.transport.fetch(address, {
      headers: { "if-none-match": etag },
    });
    expect(revalidated.status).toEqual(304);
    expect(revalidated.headers.get("etag")).toEqual(etag);

    await app.backend.db
      .updateTable("mealLogs")
      .set({ ownerKey: "someone-else" })
      .where("id", "=", id)
      .execute();
    const foreign = await app.transport.fetch(address);
    expect(foreign.status).toEqual(404);
  });

  it("should refuse an unsafe photo key and a key with no object", async () => {
    const app = await createFullApplication();

    for (const key of ["meals/a%01b", "meals/a..b", "meals/%E0%A4%A"]) {
      const response = await app.transport.fetch(`${ORIGIN}/api/photos/${key}`);
      expect(response.status).toEqual(400);
    }

    const unknown = await app.transport.fetch(
      `${ORIGIN}/api/photos/meals/default/dashboard/new/gone`,
    );
    expect(unknown.status).toEqual(404);
  });
});
