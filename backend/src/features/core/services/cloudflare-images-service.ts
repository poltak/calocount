import type { ImagesServiceInterface } from "./types.js";

/** The part of the Cloudflare Images binding that the conversion uses. */
export interface ImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    output(options: {
      format: "image/jpeg";
    }): Promise<{ response(): Response }>;
  };
}

export class CloudflareImagesService implements ImagesServiceInterface {
  constructor(private readonly binding: ImagesBinding | undefined) {}

  get available(): boolean {
    return this.binding !== undefined;
  }

  async convertHeicToJpeg(bytes: Uint8Array): Promise<Response> {
    if (!this.binding) {
      throw new Error("The Images binding is missing.");
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const output = await this.binding
      .input(stream)
      .output({ format: "image/jpeg" });
    return output.response();
  }
}
