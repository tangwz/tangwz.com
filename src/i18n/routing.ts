export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export function resolveLocale(locale?: string): Locale {
  return locale === "zh" ? "zh" : "en";
}

/** Preserve the page, query and fragment while changing its locale prefix. */
export function switchLocaleUrl(
  value: string,
  locale: Locale,
  base = "/",
  defaultLocale: Locale = "zh"
): string {
  const url = new URL(value, "https://local.invalid");
  const prefix = base.replace(/\/+$/, "");
  let path = url.pathname;
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) {
    path = path.slice(prefix.length) || "/";
  }
  path = path.replace(/^\/(en|zh)(?=\/|$)/, "") || "/";
  if (/^\/404(?:\.html|\/)?$/.test(path)) {
    path = locale === defaultLocale ? "/404.html" : "/404/";
  }
  return `${prefix}${locale === defaultLocale ? "" : `/${locale}`}${path}${url.search}${url.hash}`;
}

export function contentSlug(id: string): string {
  return id.replace(/^(en|zh)\//, "");
}

/** Entries must already be filtered by the shared publication policy. */
export function getEntryLocales<
  T extends { id: string; data: { lang?: string; draft?: boolean } },
>(entry: T, entries: T[]): Locale[] {
  const slug = contentSlug(entry.id);
  return locales.filter(locale =>
    entries.some(
      candidate =>
        !candidate.data.draft &&
        contentSlug(candidate.id) === slug &&
        (candidate.data.lang ?? "en") === locale
    )
  );
}

export function selectLocalizedEntries<
  T extends { id: string; data: { lang?: string; draft?: boolean } },
>(entries: T[], locale: string): T[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    if (entry.data.draft) continue;
    const key = contentSlug(entry.id);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()].map(
    group =>
      group.find(entry => (entry.data.lang ?? "en") === locale) ??
      group.find(entry => (entry.data.lang ?? "en") === "en") ??
      group[0]
  );
}
