type Heading = { depth: number; slug: string };

/** Positional mapping is safe only when both translations share an outline. */
export function createAnchorMap(source: Heading[], target: Heading[]) {
  const map: Record<string, string> = {
    article: "article",
    "main-content": "main-content",
  };
  const sameOutline =
    source.length === target.length &&
    source.every((heading, index) => heading.depth === target[index].depth);
  const targetIds = new Set(target.map(heading => heading.slug));
  source.forEach((heading, index) => {
    if (targetIds.has(heading.slug)) map[heading.slug] = heading.slug;
    else if (sameOutline) map[heading.slug] = target[index].slug;
  });
  return map;
}

export function remapLocaleHash(hash: string, map: Record<string, string>) {
  if (!hash) return "";
  try {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    return Object.hasOwn(map, id) ? `#${encodeURIComponent(map[id])}` : "";
  } catch {
    return "";
  }
}
