export type ThemePreference = "system" | "light" | "dark";

export function parseThemePreference(
  value: string | null | undefined,
): ThemePreference {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}
