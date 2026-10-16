export type CoverImage = string | { src: string } | undefined;

export function isPublicImagePath(path: string): boolean {
  return path.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(path);
}

export function prefixAssetPath(path: string, base = "/"): string {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) return path;

  const prefix = base.replace(/\/+$/, "");
  const root = prefix ? `${prefix}/` : "/";
  const normalized = path.replace(/^\/+/, "");
  if (!normalized) return prefix || "/";

  const pathname = `/${normalized}`;
  if (prefix && (pathname === prefix || pathname.startsWith(root)))
    return pathname;

  return root + normalized;
}

export function resolveCoverImage(
  image: CoverImage,
  base = "/"
): string | undefined {
  if (typeof image !== "string") return image?.src;
  if (!image.startsWith("/") || image.startsWith("//")) return image;
  return prefixAssetPath(image, base);
}
