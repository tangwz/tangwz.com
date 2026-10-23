export function resolveGoogleAnalyticsId(value?: string): string | undefined {
  const id = value?.trim();
  if (!id) return undefined;
  if (!/^G-[A-Z0-9]+$/.test(id)) {
    throw new Error(
      "site.googleAnalyticsId must be a GA4 measurement ID (G-...)."
    );
  }
  return id;
}
