/** The time, as a Core Service, so that a test can move it. */
export interface ClockServiceInterface {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}

/** Turns a HEIC photo into a JPEG. The Cloudflare Images binding does it. */
export interface ImagesServiceInterface {
  /** False when the Worker has no Images binding, as in a plain `wrangler dev`. */
  readonly available: boolean;
  /** The JPEG response, or a rejection when the image cannot be converted. */
  convertHeicToJpeg(bytes: Uint8Array): Promise<Response>;
}

/** Downloads the photo that an agent points at. */
export interface PhotoDownloadServiceInterface {
  /** A redirect rejects, so that a download link cannot lead to another host. */
  download(url: string): Promise<Response>;
}
