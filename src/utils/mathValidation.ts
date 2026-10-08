import { fromHtml } from "hast-util-from-html";

type HtmlTree = ReturnType<typeof fromHtml>;
type HtmlNode = HtmlTree | HtmlTree["children"][number];

export function getMathErrors(html: string): string[] {
  const errors = new Set<string>();
  const inspect = (node: HtmlNode) => {
    if (node.type === "element") {
      const { properties } = node;
      if (node.tagName === "mjx-container") {
        if (
          properties.role !== "math" ||
          typeof properties.ariaLabel !== "string" ||
          !properties.ariaLabel.trim()
        )
          errors.add("Missing accessible formula label");
        if (properties.tabIndex !== 0)
          errors.add("Formula cannot receive keyboard focus");
      }
      if (
        properties.dataMmlNode === "merror" ||
        (Array.isArray(properties.className) &&
          properties.className.includes("mathjax-error"))
      )
        errors.add("Invalid rendered formula");
    }
    if ("children" in node) node.children.forEach(inspect);
  };
  inspect(fromHtml(html));
  return [...errors];
}
