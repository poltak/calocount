import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";
import {
  ImageServer,
  type ImageRoute,
} from "../../core/tests/browser/image-server.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0, 0]);
const HEIC = Buffer.from("00000018667479706865696300000000", "hex");
const MEBIBYTE = 1024 * 1024;
const ERROR_PHOTO_CODES = "payload_too_large";

/** Serves photos the way ChatGPT's file host does, to a Worker that has no other way to reach a test. */
const ROUTES: Record<string, ImageRoute> = {
  "/png": (response) => {
    response.writeHead(200, { "content-type": "image/png" }).end(PNG);
  },
  "/png-as-jpeg": (response) => {
    response.writeHead(200, { "content-type": "image/jpeg" }).end(PNG);
  },
  "/jpeg": (response) => {
    response.writeHead(200, { "content-type": "image/jpeg" }).end(JPEG);
  },
  "/heic": (response) => {
    response.writeHead(200, { "content-type": "image/heic" }).end(HEIC);
  },
  "/missing": (response) => {
    response.writeHead(404, { "content-type": "text/plain" }).end("gone");
  },
  "/redirect": (response) => {
    response.writeHead(302, { location: "/png" }).end();
  },
  "/pdf": (response) => {
    response.writeHead(200, { "content-type": "application/pdf" }).end("%PDF");
  },
  "/huge": (response) => {
    response
      .writeHead(200, { "content-type": "image/png" })
      .end(Buffer.concat([PNG, Buffer.alloc(11 * MEBIBYTE)]));
  },
};

let server: ImageServer;
let origin = "";

test.beforeAll(async () => {
  server = await ImageServer.start(ROUTES);
  origin = server.origin;
});

test.afterAll(async () => {
  await server.stop();
});

// Only a Worker started for the black-box tests may fetch from a local
// address, and the old app has no such switch. The old app's checks of the
// download are in its unit tests.
test.beforeEach(({ baseURL }, testInfo) => {
  void baseURL;
  testInfo.skip(
    testInfo.config.metadata["blackBoxTarget"] !== "next",
    "Only the new Worker can fetch a photo from a local server.",
  );
});

function meal(name = "Photo lunch") {
  return {
    request_id: crypto.randomUUID(),
    name,
    kcal: 500,
    protein: 25,
    carbs: 50,
    fat: 20,
    eaten_at: new Date().toISOString(),
  };
}

function file(path: string, extra: Record<string, string> = {}) {
  return {
    download_url: `${origin}${path}`,
    file_id: "file-test",
    ...extra,
  };
}

interface ToolError {
  isError?: boolean;
  structuredContent?: { error?: { code: string; message: string } };
}

test.describe("add_meals with photos", () => {
  test("should download a photo, store it, and show it to the owner", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    const lunch = meal();
    const result = await agent.callTool("add_meals", {
      meals: [lunch],
      photos: [file("/png", { mime_type: "image/png" })],
      photo_meal_indices: [0],
    });

    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({
      created_count: 1,
      meals: [{ request_id: lunch.request_id, has_image: true }],
    });
    const date = lunch.eaten_at.slice(0, 10);
    const day = await ownerRequest.get(`${apiOrigin}/api/days/${date}`);
    const { meals } = (await day.json()) as {
      meals: Array<{ photoKey: string; photoMimeType: string }>;
    };
    const stored = meals[0];
    expect(stored?.photoMimeType).toBe("image/png");
    const photo = await ownerRequest.get(
      `${apiOrigin}/api/photos/${stored?.photoKey}`,
    );
    expect(photo.status()).toBe(200);
    expect(Buffer.compare(await photo.body(), PNG)).toBe(0);
  });

  test("should give each photo to the meal that its index names", async ({
    agent,
  }) => {
    const first = meal("First");
    const second = meal("Second");
    const third = meal("Third");
    const result = await agent.callTool("add_meals", {
      meals: [first, second, third],
      photos: [file("/jpeg"), file("/png")],
      photo_meal_indices: [2, 0],
    });

    expect(result.structuredContent).toMatchObject({
      created_count: 3,
      meals: [
        { request_id: first.request_id, has_image: true },
        { request_id: second.request_id, has_image: false },
        { request_id: third.request_id, has_image: true },
      ],
    });
  });

  test("should save the meal without a photo whose download failed", async ({
    agent,
  }) => {
    const lunch = meal();
    const result = await agent.callTool("add_meals", {
      meals: [lunch],
      photos: [file("/missing")],
      photo_meal_indices: [0],
    });

    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({
      created_count: 1,
      meals: [
        {
          request_id: lunch.request_id,
          has_image: false,
          photo_status: "download_failed",
        },
      ],
    });
  });

  test("should not follow a redirect to another address", async ({ agent }) => {
    const result = await agent.callTool("add_meals", {
      meals: [meal()],
      photos: [file("/redirect")],
      photo_meal_indices: [0],
    });

    expect(result.structuredContent).toMatchObject({
      meals: [{ has_image: false, photo_status: "download_failed" }],
    });
  });

  test("should not download the photo again when the agent retries a saved meal", async ({
    agent,
  }) => {
    const lunch = meal();
    const args = {
      meals: [lunch],
      photos: [file("/missing")],
      photo_meal_indices: [0],
    };
    await agent.callTool("add_meals", args);

    const again = await agent.callTool("add_meals", args);

    expect(again.structuredContent).toMatchObject({
      created_count: 0,
      already_exists_count: 1,
      meals: [{ status: "already_exists", has_image: false }],
    });
    expect(JSON.stringify(again.structuredContent)).not.toContain(
      "photo_status",
    );
  });

  for (const { path, code } of [
    { path: "/png-as-jpeg", code: "unsupported_photo_type" },
    { path: "/pdf", code: "invalid_image" },
    { path: "/huge", code: ERROR_PHOTO_CODES },
  ]) {
    test(`should refuse the photo ${path} with ${code} and save no meal`, async ({
      agent,
    }) => {
      const lunch = meal();
      const result = (await agent.callTool("add_meals", {
        meals: [lunch],
        photos: [file(path)],
        photo_meal_indices: [0],
      })) as ToolError;

      expect(result.isError).toBe(true);
      expect(result.structuredContent?.error?.code).toBe(code);
      const date = lunch.eaten_at.slice(0, 10);
      const history = await agent.callTool("get_nutrition_history", {
        start_date: date,
        end_date: date,
      });
      expect(history.structuredContent).toMatchObject({ meals: [] });
    });
  }

  test("should never store a HEIC photo as it came", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    const lunch = meal();
    const result = (await agent.callTool("add_meals", {
      meals: [lunch],
      photos: [file("/heic", { mime_type: "image/heic" })],
      photo_meal_indices: [0],
    })) as ToolError;

    // A local Worker may have no HEIC decoder. Then the call fails and saves nothing.
    // Where the converter works, the stored photo is a JPEG.
    if (result.isError) {
      expect(result.structuredContent?.error?.code).toMatch(
        /^image_conversion_(failed|unavailable)$/u,
      );
      return;
    }
    const day = await ownerRequest.get(
      `${apiOrigin}/api/days/${lunch.eaten_at.slice(0, 10)}`,
    );
    const { meals } = (await day.json()) as {
      meals: Array<{ photoMimeType: string }>;
    };
    expect(meals[0]?.photoMimeType).toBe("image/jpeg");
  });
});
