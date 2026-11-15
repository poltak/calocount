import type { EntryView } from "../utils/entry-view.js";
import { useDashboard } from "./dashboard-context.js";

/** The small photo of an entry. It opens the large view. */
export function PhotoThumbnail({
  entry,
  photoUrl,
}: {
  entry: EntryView;
  photoUrl: string;
}) {
  const { photos } = useDashboard();
  return (
    <button
      className="meal-photo-button"
      type="button"
      aria-label={`View photo of ${entry.name}`}
      onClick={() => photos.logic.open({ entry })}
    >
      <img
        className="meal-photo"
        src={photoUrl}
        alt={entry.name}
        loading="lazy"
        decoding="async"
        onError={() => photos.logic.markFailed({ url: photoUrl })}
      />
    </button>
  );
}
