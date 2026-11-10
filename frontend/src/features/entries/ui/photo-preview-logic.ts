import { Logic } from "@app/common/features/core/logic/logic";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { photoPath } from "../utils/photo-path.js";
import type { EntryView } from "../utils/entry-view.js";

type PhotoPreviewProps = FrontendLogicProps<never, never, "photos">;

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
    const key = photoPath(entry.photoKey);
    if (key === null) {
      return null;
    }
    return this.deps.api.photos[":key{.+}"].$url({ param: { key } }).href;
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
