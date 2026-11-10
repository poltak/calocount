import { useDashboard } from "./dashboard-context.js";

/**
 * The photo of an entry in a large view. The close button has the focus when
 * the view opens, so Escape closes it, and the focus goes with it.
 */
export function PhotoPreview() {
  const { photos } = useDashboard();
  const { logic } = photos;
  const entry = photos.state.previewEntry;
  if (!entry) {
    return null;
  }
  const url = logic.shownPhotoUrl({ entry });
  return (
    <div
      className="photo-preview-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          logic.close();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          logic.close();
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
          onClick={() => logic.close()}
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
              onError={() => logic.markFailed({ url })}
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
