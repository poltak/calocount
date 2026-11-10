import { entryKindLabels } from "@app/common/features/entries/utils/entry-kind";
import { formatNumber } from "../../core/utils/dashboard-format.js";
import type { PublicEntryView } from "../utils/public-entry-view.js";

function Stat({
  className,
  label,
  value,
  unit,
}: {
  className: string;
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className={`meal-stat ${className}`}>
      <span className="meal-stat-label">{label}</span>
      <span>
        {`${formatNumber(value)} `}
        <small>{unit}</small>
      </span>
    </div>
  );
}

/** One entry of the day, with its values and a photo to view. It has no buttons that change data. */
export function PublicEntryRow({
  entry,
  photoUrl,
  onOpenPhoto,
  onPhotoFailed,
}: {
  entry: PublicEntryView;
  /** The address of the photo, or `null` when the entry has none. */
  photoUrl: string | null;
  onOpenPhoto: () => void;
  onPhotoFailed: () => void;
}) {
  const withoutPhoto = photoUrl === null ? " without-photo" : "";
  return (
    <article className="meal-group" aria-label={entry.name}>
      <div className={`meal-row${withoutPhoto}`}>
        <div className={`meal-row-content${withoutPhoto}`}>
          {photoUrl !== null && (
            <button
              className="meal-photo-button"
              type="button"
              aria-label={`View photo of ${entry.name}`}
              onClick={onOpenPhoto}
            >
              <img
                className="meal-photo"
                src={photoUrl}
                alt={entry.name}
                loading="lazy"
                decoding="async"
                onError={onPhotoFailed}
              />
            </button>
          )}
          <div className="meal-info">
            <div className="meal-name-line">
              <strong>{entry.name}</strong>
              <time>{entry.time}</time>
              {entry.kind && (
                <span className="meal-kind" data-kind={entry.kind}>
                  {entryKindLabels[entry.kind]}
                </span>
              )}
            </div>
            {entry.description.trim().toLocaleLowerCase() !==
              entry.name.trim().toLocaleLowerCase() && (
              <span>{entry.description}</span>
            )}
          </div>
          <div className="meal-macros" aria-label="Entry macros">
            <Stat
              className="calories-stat"
              label="Energy"
              value={entry.calories}
              unit="kcal"
            />
            <Stat
              className="protein-stat"
              label="Protein"
              value={entry.protein}
              unit="g"
            />
            <Stat
              className="carbs-stat"
              label="Carbs"
              value={entry.carbs}
              unit="g"
            />
            <Stat className="fat-stat" label="Fat" value={entry.fat} unit="g" />
          </div>
        </div>
      </div>
    </article>
  );
}
