import { cx, h, slot } from "./dom";
import { PROTEIN_PER_KG_MIN, PROTEIN_PER_KG_MAX, PROTEIN_PER_KG_STEP, type ProteinGoalMode } from "../../domain/protein-goals";
import type { SettingsDraft } from "../dashboard-settings";
import { nutrientGoalDraftFromMap } from "../nutrition/nutrient-goal-draft";
import { nutrientGoalSettings } from "./nutrient-goal-settings";
import type { ThemePreference } from "../theme";

type SettingsPanelOptions = {
  /** Read the draft. The dashboard owns it, and it can change while the panel is open. */
  getDraft: () => SettingsDraft;
  /** Store a change to the draft. The panel shows it without help from the dashboard. */
  setDraft: (change: (current: SettingsDraft) => SettingsDraft) => void;
  onSave: () => void;
  onClose: () => void;
  getThemePreference: () => ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  /** The timezone of the device showing the panel. */
  deviceTimeZone: string;
};

export type SettingsPanel = {
  el: HTMLElement;
  /** Build the form again from the draft, with the given pending state. */
  render: (state: { loading: boolean; saving: boolean }) => void;
};

/** Every timezone the browser knows, plus the given ones in case it does not list them. */
function timeZoneOptions(...always: string[]): string[] {
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set(["UTC", ...always, ...supported])].sort((left, right) => left.localeCompare(right));
}

function sectionHeading({ id, title, detail }: { id: string; title: string; detail: string }) {
  return h("div", { class: "settings-section-heading" }, h("div", null, h("strong", { id }, title), h("span", null, detail)));
}

function inputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

/**
 * The targets, timezone, theme and nutrient goals of the owner. A typed value
 * goes to the draft and the field keeps it. The form is built again only when
 * its fields change, and then it reads every value from the draft.
 */
export function createSettingsPanel({ getDraft, setDraft, onSave, onClose, getThemePreference, onThemeChange, deviceTimeZone }: SettingsPanelOptions): SettingsPanel {
  const content = slot();
  const el = h("section", { class: "settings-panel", id: "settings-panel", role: "dialog", "aria-labelledby": "settings-title" }, ...content.anchors);
  let pending = { loading: false, saving: false };

  function render() {
    const { loading, saving } = pending;
    const disabled = loading || saving;
    el.className = cx("settings-panel", disabled && "is-pending");
    el.setAttribute("aria-busy", String(disabled));
    content.render(() => view(getDraft(), { loading, saving, disabled }));
  }

  function change(next: (current: SettingsDraft) => SettingsDraft, { rebuild = false }: { rebuild?: boolean } = {}) {
    setDraft(next);
    if (rebuild) render();
  }

  function modeOption({ mode, label, detail, draft, disabled }: { mode: ProteinGoalMode; label: string; detail: string; draft: SettingsDraft; disabled: boolean }) {
    return h("label", { "aria-label": label },
      h("input", {
        name: "protein-goal-mode",
        type: "radio",
        value: mode,
        checked: draft.proteinGoalMode === mode,
        onchange: () => change((current) => ({ ...current, proteinGoalMode: mode }), { rebuild: true }),
        disabled,
      }),
      h("span", null, h("strong", null, label), h("small", null, detail)),
    );
  }

  function themeOption({ theme, label, detail, disabled }: { theme: ThemePreference; label: string; detail: string; disabled: boolean }) {
    return h("label", { "aria-label": label },
      h("input", { name: "theme-preference", type: "radio", value: theme, checked: getThemePreference() === theme, onchange: () => onThemeChange(theme), disabled }),
      h("span", null, h("strong", null, label), h("small", null, detail)),
    );
  }

  function referenceSetting({ id, field, label, detail, draft, disabled }: {
    id: string;
    field: "vitaminB6UsFnbAdultUlEnabled" | "usFnbAdultUlEnabled";
    label: string;
    detail: string;
    draft: SettingsDraft;
    disabled: boolean;
  }) {
    return h("div", { class: "reference-setting" },
      h("input", {
        id,
        type: "checkbox",
        name: id,
        checked: draft[field],
        onchange: (event: Event) => {
          const checked = (event.target as HTMLInputElement).checked;
          change((current) => ({ ...current, [field]: checked }));
        },
        disabled,
      }),
      h("div", null, h("label", { for: id }, label), h("small", null, detail)),
    );
  }

  function view(draft: SettingsDraft, { loading, saving, disabled }: { loading: boolean; saving: boolean; disabled: boolean }) {
    return [
      h("div", { class: "settings-heading" },
        h("div", null, h("p", { class: "eyebrow" }, "Personal targets"), h("h2", { id: "settings-title" }, "Daily targets")),
        h("button", { class: "close-button", type: "button", disabled, onclick: onClose, "aria-label": "Close settings" }, "×"),
      ),
      h("form", { class: "settings-form", onsubmit: (event: Event) => { event.preventDefault(); onSave(); } },
        h("section", { class: "settings-section primary-goal-settings", "aria-labelledby": "primary-goals-title" },
          sectionHeading({ id: "primary-goals-title", title: "Primary goals", detail: "Your main energy and protein targets" }),
          h("div", { class: "primary-goal-grid" },
            h("label", null, "Calories", h("input", { name: "daily-calorie-target", type: "number", min: "10", max: "100000", step: "10", value: draft.calories, oninput: (event: Event) => { const calories = inputValue(event); change((current) => ({ ...current, calories })); }, disabled, required: true })),
            h("fieldset", { class: "protein-goal-fieldset" },
              h("legend", null, "Protein goal"),
              h("div", { class: "protein-goal-mode-options", role: "radiogroup", "aria-label": "Protein goal mode" },
                modeOption({ mode: "grams", label: "Fixed grams", detail: "Use the same target every day.", draft, disabled }),
                modeOption({ mode: "gramsPerKg", label: "Grams per kilogram", detail: "Use the selected day's weight, or the latest earlier entry.", draft, disabled }),
              ),
              draft.proteinGoalMode === "grams"
                ? h("label", null, "Protein (g)", h("input", { name: "daily-protein-target", type: "number", min: "1", max: "10000", step: "1", value: draft.proteinG, oninput: (event: Event) => { const proteinG = inputValue(event); change((current) => ({ ...current, proteinG })); }, disabled, required: true }))
                : h("label", null, "Protein (g/kg)", h("input", { name: "daily-protein-target-per-kg", type: "number", min: PROTEIN_PER_KG_MIN, max: PROTEIN_PER_KG_MAX, step: PROTEIN_PER_KG_STEP, value: draft.proteinPerKg, oninput: (event: Event) => { const proteinPerKg = inputValue(event); change((current) => ({ ...current, proteinPerKg })); }, disabled, required: true })),
            ),
          ),
        ),
        h("section", { class: "settings-section timezone-settings", "aria-labelledby": "timezone-title" },
          sectionHeading({ id: "timezone-title", title: "Timezone", detail: "Sets where each day starts on the public dashboard and in the daily totals reported to ChatGPT" }),
          h("div", { class: "timezone-setting" },
            h("select", { name: "timezone", "aria-label": "Timezone", value: draft.timezone, onchange: (event: Event) => { const timezone = inputValue(event); change((current) => ({ ...current, timezone }), { rebuild: true }); }, disabled },
              timeZoneOptions(draft.timezone, deviceTimeZone).map((zone) => h("option", { value: zone }, zone.replaceAll("_", " "))),
            ),
            draft.timezone !== deviceTimeZone ? h("button", { class: "secondary-button", type: "button", disabled, onclick: () => change((current) => ({ ...current, timezone: deviceTimeZone }), { rebuild: true }) }, `Use this device's timezone (${deviceTimeZone.replaceAll("_", " ")})`) : null,
          ),
        ),
        h("section", { class: "settings-section appearance-settings", "aria-labelledby": "appearance-title" },
          sectionHeading({ id: "appearance-title", title: "Appearance", detail: "Choose how Calocount looks on this device" }),
          h("div", { class: "protein-goal-mode-options theme-options", role: "radiogroup", "aria-label": "Theme" },
            themeOption({ theme: "system", label: "System", detail: "Follow your device preference.", disabled }),
            themeOption({ theme: "light", label: "Light", detail: "Use a light background and controls.", disabled }),
            themeOption({ theme: "dark", label: "Dark", detail: "Use the dark dashboard appearance.", disabled }),
          ),
        ),
        nutrientGoalSettings({
          values: draft.nutrients,
          disabled,
          onChange: (key, value) => change((current) => ({ ...current, nutrients: { ...current.nutrients, [key]: value } })),
          onReset: () => change((current) => ({ ...current, nutrients: nutrientGoalDraftFromMap() }), { rebuild: true }),
        }),
        h("section", { class: "settings-section", "aria-labelledby": "nutrition-reference-title" },
          sectionHeading({ id: "nutrition-reference-title", title: "Nutrition reference", detail: "Optional upper-limit comparisons for explicitly recorded values" }),
          referenceSetting({
            id: "vitamin-b6-us-fnb-adult-ul",
            field: "vitaminB6UsFnbAdultUlEnabled",
            label: "I am 19 or older; use the U.S. adult vitamin B6 upper limit",
            detail: "Compare recorded B6 intake with the U.S. Food and Nutrition Board limit of 100 mg/day. This reference does not apply to doses taken for medical treatment. Other authorities use different limits.",
            draft,
            disabled,
          }),
          referenceSetting({
            id: "us-fnb-adult-ul",
            field: "usFnbAdultUlEnabled",
            label: "I am 19 or older; use applicable U.S. nutrient upper limits",
            detail: "Compare explicitly recorded preformed vitamin A, supplemental magnesium, folic acid, and supplemental vitamin E amounts with the U.S. Food and Nutrition Board adult limits. A total nutrient value alone does not count as one of these amounts. Medical-treatment doses are outside these comparisons.",
            draft,
            disabled,
          }),
        ),
        h("button", { class: "save-button settings-save-button", type: "submit", disabled, "aria-busy": saving }, saving ? "Saving…" : loading ? "Loading…" : "Save targets"),
      ),
      h("p", { class: "settings-help", role: "status", "aria-live": "polite" }, loading ? "Loading saved targets…" : saving ? "Saving targets…" : "Targets guide the rings, nutrient progress, trend lines, and daily nudge."),
    ];
  }

  return {
    el,
    render(state) {
      pending = state;
      render();
    },
  };
}
