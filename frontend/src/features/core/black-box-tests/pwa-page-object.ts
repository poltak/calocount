import type { Page } from "@playwright/test";

/** The web app manifest, as the browser parsed it from the page's link. */
export interface ReadManifest {
  /** The address that the page's manifest link points at. */
  url: string;
  /** What the browser found wrong while it read the manifest. */
  problems: string[];
  data: {
    name?: string;
    short_name?: string;
    start_url?: string;
    scope?: string;
    display?: string;
    icons?: Array<{
      src?: string;
      sizes?: string;
      type?: string;
      purpose?: string;
    }>;
  };
}

/** What a browser needs from the app to offer to install it. */
export class PwaPageObject {
  constructor(private readonly page: Page) {}

  /** Ask the browser for the manifest of the page that is open. */
  async readManifest(): Promise<ReadManifest> {
    const session = await this.page.context().newCDPSession(this.page);
    const read = (await session.send("Page.getAppManifest", {})) as {
      url: string;
      errors: Array<{ message: string }>;
      data?: string;
    };
    const parsed: unknown = JSON.parse(read.data ?? "{}");
    return {
      url: read.url,
      problems: read.errors.map((error) => error.message),
      data: parsed as ReadManifest["data"],
    };
  }

  /** Open an address of the app, as a browser does to fetch an icon. */
  async open(address: string) {
    const response = await this.page.goto(address);
    if (response === null) {
      throw new Error(`The address ${address} gave no response`);
    }
    return response;
  }
}
