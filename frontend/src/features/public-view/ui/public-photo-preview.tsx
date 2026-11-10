import type { PublicEntryView } from "../utils/public-entry-view.js";

/**
 * The photo of a public entry in a large view. The close button has the focus
 * when the view opens, so Escape closes it, and the focus goes with it.
 */
export function PublicPhotoPreview({
  entry,
  url,
  onClose,
  onFailed,
}: {
  entry: PublicEntryView;
  /** `null` when the photo did not load. */
  url: string | null;
  onClose: () => void;
  onFailed: () => void;
}) {
  return (
    <div
      className="photo-preview-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <dialog
        className="photo-preview-dialog"
        open
        aria-modal="true"
        aria-labelledby="photo-preview-title"
      >
        <button
          className="close-button photo-preview-close"
          type="button"
          aria-label="Close photo preview"
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onClick={onClose}
        >
          ×
        </button>
        <div className="photo-preview-media">
          {url !== null ? (
            <img
              className="photo-preview-image"
              src={url}
              alt={entry.name}
              decoding="async"
              onError={onFailed}
            />
          ) : (
            <output className="photo-preview-fallback">
              Photo unavailable
            </output>
          )}
        </div>
        <p className="photo-preview-title" id="photo-preview-title">
          {entry.name}
        </p>
      </dialog>
    </div>
  );
}
