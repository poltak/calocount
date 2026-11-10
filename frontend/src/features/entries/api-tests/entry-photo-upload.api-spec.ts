import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const OTHER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4IyeHFTEMLQkAid1GAXiz9RcAAAAASUVORK5CYII=",
  "base64",
);
const MEBIBYTE = 1024 * 1024;

const ENTRY = {
  caption: "Soup",
  mealType: "lunch",
  items: [{ name: "Soup", calories: 200, proteinG: 8 }],
};

function photoField(buffer: Buffer, mimeType = "image/png", name = "soup.png") {
  return { name, mimeType, buffer };
}

test.describe("owner photo upload", () => {
  test("should store a photo sent with an entry and send it back to the owner only", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const created = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      multipart: {
        payload: JSON.stringify(ENTRY),
        photo: photoField(PNG),
      },
    });
    expect(created.status()).toBe(201);
    const { meal } = await created.json();
    expect(meal.photoMimeType).toBe("image/png");
    expect(meal.photoSizeBytes).toBe(PNG.byteLength);
    const address = `${apiOrigin}/api/photos/${meal.photoKey}`;

    const photo = await ownerRequest.get(address);
    expect(photo.status()).toBe(200);
    expect(photo.headers()["content-type"]).toBe("image/png");
    expect(photo.headers()["cache-control"]).toBe("private, max-age=300");
    expect(Buffer.compare(await photo.body(), PNG)).toBe(0);

    const etag = photo.headers()["etag"] ?? "";
    expect(etag).not.toBe("");
    const unchanged = await ownerRequest.get(address, {
      headers: { "if-none-match": etag },
    });
    expect(unchanged.status()).toBe(304);

    expect((await anonymousRequest.get(address)).status()).toBe(401);
  });

  test("should accept the entry as single form fields", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const created = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      multipart: {
        caption: "A quick snack",
        mealType: "snack",
        items: JSON.stringify([{ name: "Yogurt", calories: 120 }]),
        photo: photoField(PNG),
      },
    });

    expect(created.status()).toBe(201);
    const { meal } = await created.json();
    expect(meal).toMatchObject({ caption: "A quick snack", mealType: "snack" });
    expect(meal.items).toEqual([
      expect.objectContaining({ name: "Yogurt", calories: 120 }),
    ]);
  });

  test("should ignore a photo key that the form names", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const created = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      multipart: {
        payload: JSON.stringify({ ...ENTRY, photoKey: "private/other-key" }),
      },
    });

    expect(created.status()).toBe(201);
    expect((await created.json()).meal.photoKey).toBeNull();
  });

  test("should refuse a photo of the wrong type, or with the wrong content, and a photo that is too large", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const send = (photo: ReturnType<typeof photoField>) =>
      ownerRequest.post(`${apiOrigin}/api/meals`, {
        multipart: { payload: JSON.stringify(ENTRY), photo },
      });

    expect(
      (await send(photoField(PNG, "image/gif", "soup.gif"))).status(),
    ).toBe(415);
    expect(
      (await send(photoField(PNG, "image/jpeg", "soup.jpg"))).status(),
    ).toBe(415);
    expect(
      (await send(photoField(Buffer.alloc(10 * MEBIBYTE + 1)))).status(),
    ).toBe(413);
  });

  test("should refuse a malformed form and a body over the limit, and save no entry", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const malformed = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      headers: { "content-type": "multipart/form-data; boundary=calocount" },
      data: Buffer.from("this is not a multipart form"),
    });
    expect(malformed.status()).toBe(400);

    const notJson = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      multipart: { payload: "{", photo: photoField(PNG) },
    });
    expect(notJson.status()).toBe(400);

    const huge = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      headers: { "content-type": "multipart/form-data; boundary=calocount" },
      data: Buffer.alloc(12 * MEBIBYTE),
    });
    expect(huge.status()).toBe(413);

    const day = await ownerRequest.get(
      `${apiOrigin}/api/days/${new Date().toISOString().slice(0, 10)}?timezone=UTC`,
    );
    expect((await day.json()).meals).toEqual([]);
  });

  test("should replace the photo of an entry and remove the old one", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const created = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      multipart: { payload: JSON.stringify(ENTRY), photo: photoField(PNG) },
    });
    const { meal } = await created.json();
    const oldAddress = `${apiOrigin}/api/photos/${meal.photoKey}`;

    const patched = await ownerRequest.patch(
      `${apiOrigin}/api/meals/${meal.id}`,
      { multipart: { payload: "{}", photo: photoField(OTHER_PNG) } },
    );

    expect(patched.status()).toBe(200);
    const body = await patched.json();
    expect(body.photoDeleted).toBe(true);
    expect(body.meal.photoKey).not.toBe(meal.photoKey);
    expect((await ownerRequest.get(oldAddress)).status()).toBe(404);
    const current = await ownerRequest.get(
      `${apiOrigin}/api/photos/${body.meal.photoKey}`,
    );
    expect(Buffer.compare(await current.body(), OTHER_PNG)).toBe(0);
  });

  test("should keep the photo of a copy until the last entry that uses it goes", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const created = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      multipart: { payload: JSON.stringify(ENTRY), photo: photoField(PNG) },
    });
    const { meal } = await created.json();
    const copied = await ownerRequest.post(
      `${apiOrigin}/api/meals/${meal.id}/copy`,
      { data: {} },
    );
    const copy = (await copied.json()).meal;
    const address = `${apiOrigin}/api/photos/${meal.photoKey}`;

    const deletedFirst = await ownerRequest.delete(
      `${apiOrigin}/api/meals/${meal.id}`,
    );
    expect(deletedFirst.status()).toBe(200);
    expect((await ownerRequest.get(address)).status()).toBe(200);

    const deletedLast = await ownerRequest.delete(
      `${apiOrigin}/api/meals/${copy.id}`,
    );
    expect((await deletedLast.json()).photoDeleted).toBe(true);
    expect((await ownerRequest.get(address)).status()).toBe(404);
  });

  test("should refuse an unsafe photo address and an address that no entry uses", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const unsafe = await ownerRequest.get(
      `${apiOrigin}/api/photos/meals/a%01b`,
    );
    expect(unsafe.status()).toBe(400);

    const unknown = await ownerRequest.get(
      `${apiOrigin}/api/photos/meals/default/dashboard/new/not-there`,
    );
    expect(unknown.status()).toBe(404);
  });
});
