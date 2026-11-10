import type { PhotoDownloadServiceInterface } from "./types.js";

export class FetchPhotoDownloadService implements PhotoDownloadServiceInterface {
  async download(url: string): Promise<Response> {
    // Workers do not implement `redirect: "error"`, and fetch throws on it.
    const response = await fetch(url, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("The download link redirected.");
    }
    return response;
  }
}
