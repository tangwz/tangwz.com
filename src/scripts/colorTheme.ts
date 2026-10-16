export type ColorTheme = "light" | "dark";

export function resolveColorTheme(
  preference: string | null,
  prefersDark: boolean,
  enabled = true
): ColorTheme {
  if (!enabled) return "light";
  if (preference === "light" || preference === "dark") return preference;
  return prefersDark ? "dark" : "light";
}
