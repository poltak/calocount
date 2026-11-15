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
  caseName: string,
) {
  const result = (await agent.callTool("add_meals", args)) as ToolError;
  expect(result.isError, caseName).toBe(true);
  return result.structuredContent?.error;
}

test.describe("add_meals photo values that cannot be used", () => {
  test("should refuse each download link that cannot be used, and name the reason", async ({
    agent,
  }) => {
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
      const caseName = `the download link ${url} with ${reason}`;
      const error = await refusal(
        agent,
        {
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
        },
        caseName,
      );

      expect(error?.code, caseName).toBe("invalid_image_refs");
      expect(error?.message, caseName).toBe(
        `openaiFileIdRefs contains no usable image. Reasons: ${reason}.`,
      );
    }
  });

  test("should tell the agent that a TIFF is not supported, and refuse a bare path or file ID", async ({
    agent,
  }) => {
    const tiffError = await refusal(
      agent,
      {
        meals: [meal()],
        photos: [
          {
            download_url: "https://files.oaiusercontent.com/tiff-test",
            file_id: "file-tiff-test",
            mime_type: "image/tiff",
          },
        ],
        photo_meal_indices: [0],
      },
      "a TIFF photo",
    );

    expect(tiffError?.code, "a TIFF photo").toBe("unsupported_image_type");
    expect(tiffError?.message, "a TIFF photo").toMatch(
      /Use JPEG, PNG, WebP, or HEIC/u,
    );

    for (const photo of [
      "/mnt/data/1000072671.heic",
      "file_000000004c4481fa8c2f31c450bb37d3",
    ]) {
      const caseName = `the bare value ${photo}`;
      const error = await refusal(
        agent,
        { meals: [meal()], photos: [photo], photo_meal_indices: [0] },
        caseName,
      );

      expect(error?.code, caseName).toBe("invalid_field");
      expect(error?.message, caseName).toMatch(
        /file object with download_url and file_id.*Bare local paths and bare file IDs cannot be resolved/u,
      );
    }
  });

  test("should refuse wrong photo indices and save no meal, and treat empty photo lists as no photos", async ({
    agent,
  }) => {
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
      const lunch = meal();
      const error = await refusal(agent, { meals: [lunch], ...args }, name);

      expect(error?.code, name).toBe("invalid_field");
      const date = lunch.eaten_at.slice(0, 10);
      const history = await agent.callTool("get_nutrition_history", {
        start_date: date,
        end_date: date,
      });
      expect(history.structuredContent, name).toMatchObject({ meals: [] });
    }

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
