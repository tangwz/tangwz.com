import { fromHtml } from "hast-util-from-html";

type HtmlTree = ReturnType<typeof fromHtml>;
type HtmlNode = HtmlTree | HtmlTree["children"][number];

/** Use the page's real alternates instead of inferring them from route prefixes. */
export function getLanguageAlternates(
  html: string
): { lang: string; url: string }[] {
  const links: { lang: string; url: string }[] = [];
  const inspect = (node: HtmlNode, inHead = false) => {
    const head = inHead || (node.type === "element" && node.tagName === "head");
    if (head && node.type === "element" && node.tagName === "link") {
      const { rel, hrefLang, href } = node.properties;
      if (
        Array.isArray(rel) &&
        rel.includes("alternate") &&
        typeof hrefLang === "string" &&
        hrefLang &&
        typeof href === "string" &&
        href
      )
        links.push({ lang: hrefLang, url: href });
    }
    if ("children" in node)
      node.children.forEach(child => inspect(child, head));
  };
  inspect(fromHtml(html));
  return links;
}
