/** Map a deployed URL pathname to its path inside the static output directory. */
export function getOutputPath(
  pathname: string,
  base = "/"
): string | undefined {
  const path = decodeURIComponent(pathname);
  const prefix = decodeURIComponent(base).replace(/\/+$/, "");
  if (!prefix) return path;
  if (path === prefix) return "/";
  return path.startsWith(prefix + "/") ? path.slice(prefix.length) : undefined;
}
