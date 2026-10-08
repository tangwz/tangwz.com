/**
 * Replace `{{key}}` placeholders in UI strings.
 * Translators can reorder placeholders freely within the sentence.
 */
export function tplStr(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value !== undefined && value !== null ? String(value) : "";
  });
}

export function formatDateInTimezone(
  date: Date,
  locale: string | undefined,
  month: "long" | "short",
  timeZone: string
): string {
  return date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    month,
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}
