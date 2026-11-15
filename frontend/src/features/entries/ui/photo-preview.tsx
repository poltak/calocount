import { useEffect, useRef } from "react";
import { useDashboard } from "./dashboard-context.js";

/**
 * The photo of an entry in a large view. The close button has the focus when
 * the view opens, so Escape closes it. The focus goes back to what had it
 * before, as the view closes.
 */
export function PhotoPreview() {
  const { photos } = useDashboard();
  const { logic } = photos;
  const entry = photos.state.previewEntry;
  const open = entry !== null;
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    // Read the focus before the close button takes it.
    const previous = closeButton.current?.ownerDocument.activeElement;
    closeButton.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, [open]);
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
          ref={closeButton}
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
