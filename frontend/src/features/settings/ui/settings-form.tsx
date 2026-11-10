import {
  PROTEIN_PER_KG_MAX,
  PROTEIN_PER_KG_MIN,
  PROTEIN_PER_KG_STEP,
  type ProteinGoalMode,
} from "@app/common/features/goals/utils/daily-targets";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import {
  settingsDraftOf,
  timeZoneOptions,
  type SettingsDraft,
} from "../utils/settings-draft.js";
import type { ThemePreference } from "../utils/theme.js";
import { NutrientGoalSettings } from "./nutrient-goal-settings.js";
import { useSettings } from "./settings-context.js";

function SectionHeading({
  id,
  title,
  detail,
}: {
  id: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="settings-section-heading">
      <div>
        <strong id={id}>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function RadioOption({
  name,
  label,
  detail,
  checked,
  disabled,
  onSelect,
}: {
  name: string;
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label aria-label={label}>
      <input
        name={name}
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </label>
  );
}

function ReferenceSetting({
  id,
  label,
  detail,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="reference-setting">
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div>
        <label htmlFor={id}>{label}</label>
        <small>{detail}</small>
      </div>
    </div>
  );
}

const THEMES: { theme: ThemePreference; label: string; detail: string }[] = [
  {
    theme: "system",
    label: "System",
    detail: "Follow your device preference.",
  },
  {
    theme: "light",
    label: "Light",
    detail: "Use a light background and controls.",
  },
  {
    theme: "dark",
    label: "Dark",
    detail: "Use the dark dashboard appearance.",
  },
];

/** The targets, the timezone, the theme, the nutrition goals and the upper-limit consents. */
export function SettingsForm() {
  const { logic, state, theme } = useSettings();
  const app = useFrontendApp();
  const { clock } = app.services;
  const deviceTimeZone = clock.timeZone();
  const loading = state.loadState === "running";
  const saving = state.saveState === "running";
  const disabled = loading || saving;
  const draft: SettingsDraft =
    state.draft ?? settingsDraftOf({ saved: null, deviceTimeZone });
  const change = (part: Partial<SettingsDraft>) =>
    logic.changeDraft({ change: part });
  const mode = (value: ProteinGoalMode) => () =>
    logic.setProteinMode({ mode: value });
  const message = state.saveError ?? state.loadError;
  return (
    <>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void logic.save();
        }}
      >
        <section
          className="settings-section primary-goal-settings"
          aria-labelledby="primary-goals-title"
        >
          <SectionHeading
            id="primary-goals-title"
            title="Primary goals"
            detail="Your main energy and protein targets"
          />
          <div className="primary-goal-grid">
            <label>
              Calories
              <input
                name="daily-calorie-target"
                type="number"
                min="10"
                max="100000"
                step="10"
                required
                value={draft.calories}
                disabled={disabled}
                onChange={(event) => change({ calories: event.target.value })}
              />
            </label>
            <fieldset className="protein-goal-fieldset">
              <legend>Protein goal</legend>
              <div
                className="protein-goal-mode-options"
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The legend above names the fieldset; the group names its options.
                role="radiogroup"
                aria-label="Protein goal mode"
              >
                <RadioOption
                  name="protein-goal-mode"
                  label="Fixed grams"
                  detail="Use the same target every day."
                  checked={draft.proteinGoalMode === "grams"}
                  disabled={disabled}
                  onSelect={mode("grams")}
                />
                <RadioOption
                  name="protein-goal-mode"
                  label="Grams per kilogram"
                  detail="Use the selected day's weight, or the latest earlier entry."
                  checked={draft.proteinGoalMode === "gramsPerKg"}
                  disabled={disabled}
                  onSelect={mode("gramsPerKg")}
                />
              </div>
              {draft.proteinGoalMode === "grams" ? (
                <label>
                  Protein (g)
                  <input
                    name="daily-protein-target"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    required
                    value={draft.proteinG}
                    disabled={disabled}
                    onChange={(event) =>
                      change({ proteinG: event.target.value })
                    }
                  />
                </label>
              ) : (
                <label>
                  Protein (g/kg)
                  <input
                    name="daily-protein-target-per-kg"
                    type="number"
                    min={PROTEIN_PER_KG_MIN}
                    max={PROTEIN_PER_KG_MAX}
                    step={PROTEIN_PER_KG_STEP}
                    required
                    value={draft.proteinPerKg}
                    disabled={disabled}
                    onChange={(event) =>
                      change({ proteinPerKg: event.target.value })
                    }
                  />
                </label>
              )}
            </fieldset>
          </div>
        </section>

        <section
          className="settings-section timezone-settings"
          aria-labelledby="timezone-title"
        >
          <SectionHeading
            id="timezone-title"
            title="Timezone"
            detail="Sets where each day starts on the public dashboard and in the daily totals reported to ChatGPT"
          />
          <div className="timezone-setting">
            <select
              name="timezone"
              aria-label="Timezone"
              value={draft.timezone}
              disabled={disabled}
              onChange={(event) => change({ timezone: event.target.value })}
            >
              {timeZoneOptions(draft.timezone, deviceTimeZone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            {draft.timezone !== deviceTimeZone && (
              <button
                className="secondary-button"
                type="button"
                disabled={disabled}
                onClick={() => logic.chooseDeviceTimeZone()}
              >
                {`Use this device's timezone (${deviceTimeZone.replaceAll("_", " ")})`}
              </button>
            )}
          </div>
        </section>

        {app.profile === "owner" && (
          <>
            <section
              className="settings-section public-view-settings"
              aria-labelledby="public-view-title"
            >
              <SectionHeading
                id="public-view-title"
                title="Public dashboard"
                detail="Who can see your log"
              />
              <ReferenceSetting
                id="public-view-enabled"
                label="Show my log to anyone who opens the site address"
                detail="Visitors see your entries, food items, nutrients, weights and the photos of the last seven days. They cannot make changes. Notes and captions stay private. When this is off, the site address opens your own dashboard after you sign in."
                checked={draft.publicViewEnabled}
                disabled={disabled}
                onChange={(checked) => change({ publicViewEnabled: checked })}
              />
            </section>

            <section
              className="settings-section partner-profile-settings"
              aria-labelledby="partner-profile-title"
            >
              <SectionHeading
                id="partner-profile-title"
                title="Partner profile"
                detail="A second log on this site"
              />
              <ReferenceSetting
                id="partner-profile-enabled"
                label="Keep a second log for a partner"
                detail="Adds a Partner profile at /owner/partner with its own entries, weights and goals. It uses your sign-in, and ChatGPT can log to it when you ask. The public dashboard shows only your log."
                checked={draft.partnerProfileEnabled}
                disabled={disabled}
                onChange={(checked) =>
                  change({ partnerProfileEnabled: checked })
                }
              />
            </section>
          </>
        )}

        <section
          className="settings-section appearance-settings"
          aria-labelledby="appearance-title"
        >
          <SectionHeading
            id="appearance-title"
            title="Appearance"
            detail="Choose how Calocount looks on this device"
          />
          <div
            className="protein-goal-mode-options theme-options"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The section heading names the group.
            role="radiogroup"
            aria-label="Theme"
          >
            {THEMES.map(({ theme: option, label, detail }) => (
              <RadioOption
                key={option}
                name="theme-preference"
                label={label}
                detail={detail}
                checked={theme.state.preference === option}
                disabled={disabled}
                onSelect={() => theme.logic.select({ preference: option })}
              />
            ))}
          </div>
        </section>

        <NutrientGoalSettings values={draft.nutrients} disabled={disabled} />

        <section
          className="settings-section"
          aria-labelledby="nutrition-reference-title"
        >
          <SectionHeading
            id="nutrition-reference-title"
            title="Nutrition reference"
            detail="Optional upper-limit comparisons for explicitly recorded values"
          />
          <ReferenceSetting
            id="vitamin-b6-us-fnb-adult-ul"
            label="I am 19 or older; use the U.S. adult vitamin B6 upper limit"
            detail="Compare recorded B6 intake with the U.S. Food and Nutrition Board limit of 100 mg/day. This reference does not apply to doses taken for medical treatment. Other authorities use different limits."
            checked={draft.vitaminB6UsFnbAdultUlEnabled}
            disabled={disabled}
            onChange={(checked) =>
              change({ vitaminB6UsFnbAdultUlEnabled: checked })
            }
          />
          <ReferenceSetting
            id="us-fnb-adult-ul"
            label="I am 19 or older; use applicable U.S. nutrient upper limits"
            detail="Compare explicitly recorded preformed vitamin A, supplemental magnesium, folic acid, and supplemental vitamin E amounts with the U.S. Food and Nutrition Board adult limits. A total nutrient value alone does not count as one of these amounts. Medical-treatment doses are outside these comparisons."
            checked={draft.usFnbAdultUlEnabled}
            disabled={disabled}
            onChange={(checked) => change({ usFnbAdultUlEnabled: checked })}
          />
        </section>

        <button
          className="save-button settings-save-button"
          type="submit"
          disabled={disabled}
          aria-busy={saving}
        >
          {saving ? "Saving…" : loading ? "Loading…" : "Save targets"}
        </button>
      </form>
      {message ? (
        <p className="settings-help error" role="alert">
          {message}
        </p>
      ) : (
        <output className="settings-help" aria-live="polite">
          {loading
            ? "Loading saved targets…"
            : saving
              ? "Saving targets…"
              : "Targets guide the rings, nutrient progress, trend lines, and daily nudge."}
        </output>
      )}
    </>
  );
}
