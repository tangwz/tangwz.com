export type PublicationData = {
  draft?: boolean;
  template?: boolean;
  pubDatetime: Date;
};

/** Apply the same schedule before choosing an article or video translation. */
export function isPublished(
  data: PublicationData,
  options: { development?: boolean; margin?: number; now?: number } = {}
): boolean {
  return (
    !data.draft &&
    (options.development === true ||
      (options.now ?? Date.now()) >=
        data.pubDatetime.getTime() - (options.margin ?? 0))
  );
}

export function isPublicWork(data: PublicationData): boolean {
  return !data.template;
}
