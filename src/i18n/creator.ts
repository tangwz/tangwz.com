import messages from "./messages/zh.json";
import { resolveLocale } from "./routing";
import config from "@/config";
import { formatDateInTimezone } from "./format";

const catalog: Record<string, string> = messages;

/** English source strings are stable keys; interpolate after translation. */
export function translate(locale: string | undefined, source: string): string {
  return resolveLocale(locale) === "zh"
    ? (catalog[source] ?? catalog[source.trim()] ?? source)
    : source;
}

export function useCreatorTranslations(locale?: string) {
  return (source: string) => translate(locale, source);
}

export function formatDate(
  date: Date,
  locale?: string,
  month: "long" | "short" = "long",
  timeZone = config.site.timezone
) {
  return formatDateInTimezone(date, locale, month, timeZone);
}
