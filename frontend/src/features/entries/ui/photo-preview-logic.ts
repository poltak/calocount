import { Logic } from "@app/common/features/core/logic/logic";
import {
  withProfile,
  type Profile,
} from "@app/common/features/core/utils/profile";
import type { Audience, FrontendLogicProps } from "../../core/logic/types.js";
import { photoPath } from "../utils/photo-path.js";
import type { EntryView } from "../utils/entry-view.js";

type PhotoPreviewProps = FrontendLogicProps<
  never,
  never,
  "photos" | "public"
> & {
  /** The log whose photos these are. The photo route needs it. */
  profile: Profile;
  /** A visitor reads the public photo route, which takes the entry ID. */
  audience: Audience;
};

interface PhotoPreviewState {
  /** The entry whose photo shows large, or `null`. */
  previewEntry: EntryView | null;
  /** Photos that did not load. An entry with one shows no thumbnail. */
  failedUrls: string[];
}

/** The photos of the entries: where each one is, which ones failed, and the large view. */
export class PhotoPreviewLogic extends Logic<
  PhotoPreviewProps,
  PhotoPreviewState
> {
  constructor(deps: PhotoPreviewProps) {
    super({ deps, initialState: { previewEntry: null, failedUrls: [] } });
  }

  /** The address of the photo of an entry, or `null` when it has none. */
  photoUrl({ entry }: { entry: EntryView }): string | null {
    if (this.deps.audience === "public") {
      // The route is on the origin of the API and takes the entry ID, so the private bucket key never reaches the page.
      return entry.publicPhoto
        ? `${this.deps.api.public.summary.$url().origin}/meal-photos/${encodeURIComponent(entry.id)}`
        : null;
    }
    const key = photoPath(entry.photoKey);
    if (key === null) {
      return null;
    }
    // `photoPath` encodes each segment and keeps the `/` between them, which the
    // photo route reads. A second encoding turns each `/` into `%2F`.
    // oxlint-disable-next-line stack/encode-api-params
    const { href } = this.deps.api.photos[":key{.+}"].$url({ param: { key } });
    return withProfile({ url: href, profile: this.deps.profile });
  }

  /** The address of the photo, unless it is known to fail. */
  shownPhotoUrl({ entry }: { entry: EntryView }): string | null {
    const url = this.photoUrl({ entry });
    return url !== null && !this.state.failedUrls.includes(url) ? url : null;
  }

  open({ entry }: { entry: EntryView }): void {
    this.setState({ previewEntry: entry });
  }

  close(): void {
    this.setState({ previewEntry: null });
  }

  markFailed({ url }: { url: string }): void {
    if (!this.state.failedUrls.includes(url)) {
      this.setState({ failedUrls: [...this.state.failedUrls, url] });
    }
  }
}
