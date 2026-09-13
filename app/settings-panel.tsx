import type { Dispatch, SetStateAction } from "react";
import { PROTEIN_PER_KG_MIN, PROTEIN_PER_KG_MAX, PROTEIN_PER_KG_STEP } from "../domain/protein-goals";
import type { NutrientKey } from "../domain/nutrients";
import type { SettingsDraft } from "./dashboard-settings";
import { nutrientGoalDraftFromMap } from "./nutrition/nutrient-goal-draft";
import { NutrientGoalSettings } from "./nutrition/nutrient-goal-settings";
import type { ThemePreference } from "./theme";

type SettingsPanelProps = {
  draft: SettingsDraft;
  setDraft: Dispatch<SetStateAction<SettingsDraft>>;
  onSave: () => Promise<void>;
  onClose: () => void;
  loading: boolean;
  saving: boolean;
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
};

export default function SettingsPanel({ draft, setDraft, onSave, onClose, loading, saving, themePreference, onThemeChange }: SettingsPanelProps) {
  return <section className={`settings-panel${loading || saving ? " is-pending" : ""}`} id="settings-panel" role="dialog" aria-labelledby="settings-title" aria-busy={loading || saving}>
    <div className="settings-heading"><div><p className="eyebrow">Personal targets</p><h2 id="settings-title">Daily targets</h2></div><button className="close-button" type="button" disabled={loading || saving} onClick={onClose} aria-label="Close settings">×</button></div>
    <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void onSave(); }}>
      <section className="settings-section primary-goal-settings" aria-labelledby="primary-goals-title">
        <div className="settings-section-heading"><div><strong id="primary-goals-title">Primary goals</strong><span>Your main energy and protein targets</span></div></div>
        <div className="primary-goal-grid">
          <label>Calories<input name="daily-calorie-target" type="number" min="10" max="100000" step="10" value={draft.calories} onChange={(event) => setDraft((current) => ({ ...current, calories: event.target.value }))} disabled={loading || saving} required /></label>
          <fieldset className="protein-goal-fieldset">
            <legend>Protein goal</legend>
            <div className="protein-goal-mode-options" role="radiogroup" aria-label="Protein goal mode">
              <label aria-label="Fixed grams">
                <input
                  name="protein-goal-mode"
                  type="radio"
                  value="grams"
                  checked={draft.proteinGoalMode === "grams"}
                  onChange={() => setDraft((current) => ({ ...current, proteinGoalMode: "grams" }))}
                  disabled={loading || saving}
                />
                <span><strong>Fixed grams</strong><small>Use the same target every day.</small></span>
              </label>
              <label aria-label="Grams per kilogram">
                <input
                  name="protein-goal-mode"
                  type="radio"
                  value="gramsPerKg"
                  checked={draft.proteinGoalMode === "gramsPerKg"}
                  onChange={() => setDraft((current) => ({ ...current, proteinGoalMode: "gramsPerKg" }))}
                  disabled={loading || saving}
                />
                <span><strong>Grams per kilogram</strong><small>Use the selected day&apos;s weight, or the latest earlier entry.</small></span>
              </label>
            </div>
            {draft.proteinGoalMode === "grams" ? <label>Protein (g)<input name="daily-protein-target" type="number" min="1" max="10000" step="1" value={draft.proteinG} onChange={(event) => setDraft((current) => ({ ...current, proteinG: event.target.value }))} disabled={loading || saving} required /></label> : <label>Protein (g/kg)<input name="daily-protein-target-per-kg" type="number" min={PROTEIN_PER_KG_MIN} max={PROTEIN_PER_KG_MAX} step={PROTEIN_PER_KG_STEP} value={draft.proteinPerKg} onChange={(event) => setDraft((current) => ({ ...current, proteinPerKg: event.target.value }))} disabled={loading || saving} required /></label>}
          </fieldset>
        </div>
      </section>
      <section className="settings-section appearance-settings" aria-labelledby="appearance-title">
        <div className="settings-section-heading"><div><strong id="appearance-title">Appearance</strong><span>Choose how Calocount looks on this device</span></div></div>
        <div className="protein-goal-mode-options theme-options" role="radiogroup" aria-label="Theme">
          <label aria-label="System">
            <input name="theme-preference" type="radio" value="system" checked={themePreference === "system"} onChange={() => onThemeChange("system")} disabled={loading || saving} />
            <span><strong>System</strong><small>Follow your device preference.</small></span>
          </label>
          <label aria-label="Light">
            <input name="theme-preference" type="radio" value="light" checked={themePreference === "light"} onChange={() => onThemeChange("light")} disabled={loading || saving} />
            <span><strong>Light</strong><small>Use a light background and controls.</small></span>
          </label>
          <label aria-label="Dark">
            <input name="theme-preference" type="radio" value="dark" checked={themePreference === "dark"} onChange={() => onThemeChange("dark")} disabled={loading || saving} />
            <span><strong>Dark</strong><small>Use the dark dashboard appearance.</small></span>
          </label>
        </div>
      </section>
      <NutrientGoalSettings
        values={draft.nutrients}
        disabled={loading || saving}
        onChange={(key: NutrientKey, value: string) => setDraft((current) => ({
          ...current,
          nutrients: { ...current.nutrients, [key]: value },
        }))}
        onReset={() => setDraft((current) => ({ ...current, nutrients: nutrientGoalDraftFromMap() }))}
      />
      <button className="save-button settings-save-button" type="submit" disabled={loading || saving} aria-busy={saving}>{saving ? "Saving…" : loading ? "Loading…" : "Save targets"}</button>
    </form>
    <p className="settings-help" role="status" aria-live="polite">{loading ? "Loading saved targets…" : saving ? "Saving targets…" : "Targets guide the rings, nutrient progress, trend lines, and daily nudge."}</p>
  </section>;
}
