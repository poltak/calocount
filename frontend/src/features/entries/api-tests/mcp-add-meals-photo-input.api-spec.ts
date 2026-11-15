import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

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

interface ToolError {
  isError?: boolean;
  structuredContent?: { error?: { code: string; message: string } };
}

async function refusal(
  agent: { callTool: (name: string, args: unknown) => Promise<unknown> },
  args: Record<string, unknown>,
) {
  const result = (await agent.callTool("add_meals", args)) as ToolError;
  expect(result.isError).toBe(true);
  return result.structuredContent?.error;
}

test.describe("add_meals photo values that cannot be used", () => {
  for (const { url, reason } of [
    {
      url: "https://provider.example/private-photo?signature=secret-query#secret-fragment",
      reason: "unsupported_host",
    },
    { url: "/mnt/data/private-photo.heic", reason: "malformed_download_url" },
    {
      url: "http://provider.example/private-photo",
      reason: "unsupported_scheme",
    },
    {
      url: "https://secret-user:secret-pass@provider.example/private-photo",
      reason: "credentials_or_port",
    },
    {
      url: "https://provider.example:8443/private-photo",
      reason: "credentials_or_port",
    },
    { url: "https://files.oaiusercontent.com/", reason: "missing_path" },
  ]) {
    test(`should refuse the download link ${url} with ${reason}`, async ({
      agent,
    }) => {
      const error = await refusal(agent, {
        meals: [meal()],
        photos: [
          {
            download_url: url,
            file_id: "secret-file-id",
            file_name: "secret-name.heic",
            mime_type: "image/heic",
          },
        ],
        photo_meal_indices: [0],
      });

      expect(error?.code).toBe("invalid_image_refs");
      expect(error?.message).toBe(
        `openaiFileIdRefs contains no usable image. Reasons: ${reason}.`,
      );
    });
  }

  test("should tell the agent that a TIFF is not supported", async ({
    agent,
  }) => {
    const error = await refusal(agent, {
      meals: [meal()],
      photos: [
        {
          download_url: "https://files.oaiusercontent.com/tiff-test",
          file_id: "file-tiff-test",
          mime_type: "image/tiff",
        },
      ],
      photo_meal_indices: [0],
    });

    expect(error?.code).toBe("unsupported_image_type");
    expect(error?.message).toMatch(/Use JPEG, PNG, WebP, or HEIC/u);
  });

  for (const photo of [
    "/mnt/data/1000072671.heic",
    "file_000000004c4481fa8c2f31c450bb37d3",
  ]) {
    test(`should refuse the bare value ${photo}`, async ({ agent }) => {
      const error = await refusal(agent, {
        meals: [meal()],
        photos: [photo],
        photo_meal_indices: [0],
      });

      expect(error?.code).toBe("invalid_field");
      expect(error?.message).toMatch(
        /file object with download_url and file_id.*Bare local paths and bare file IDs cannot be resolved/u,
      );
    });
  }

  const link = "https://files.oaiusercontent.com/synthetic";
  for (const { name, args } of [
    {
      name: "photos without indices",
      args: { photos: [{ download_url: link, file_id: "f" }] },
    },
    {
      name: "a different number of photos and indices",
      args: {
        photos: [{ download_url: link, file_id: "f" }],
        photo_meal_indices: [0, 1],
      },
    },
    {
      name: "an index that names no meal",
      args: {
        photos: [{ download_url: link, file_id: "f" }],
        photo_meal_indices: [3],
      },
    },
    {
      name: "two photos for one meal",
      args: {
        photos: [
          { download_url: link, file_id: "f" },
          { download_url: link, file_id: "g" },
        ],
        photo_meal_indices: [0, 0],
      },
    },
  ]) {
    test(`should refuse ${name} and save no meal`, async ({ agent }) => {
      const lunch = meal();
      const error = await refusal(agent, { meals: [lunch], ...args });

      expect(error?.code).toBe("invalid_field");
      const date = lunch.eaten_at.slice(0, 10);
      const history = await agent.callTool("get_nutrition_history", {
        start_date: date,
        end_date: date,
      });
      expect(history.structuredContent).toMatchObject({ meals: [] });
    });
  }

  test("should treat empty photo lists as no photos", async ({ agent }) => {
    const result = await agent.callTool("add_meals", {
      meals: [meal()],
      photos: [],
      photo_meal_indices: [],
    });

    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({
      meals: [{ has_image: false }],
    });
  });
});
