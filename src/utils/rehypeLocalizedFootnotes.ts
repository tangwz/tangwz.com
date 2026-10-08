type ContentNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  value?: string;
  children?: ContentNode[];
};

type ContentFile = {
  data: { astro?: { frontmatter?: { lang?: string } } };
};

export function rehypeLocalizedFootnotes() {
  return (tree: ContentNode, file: ContentFile) => {
    if (file.data.astro?.frontmatter?.lang !== "zh") return;

    function localize(node: ContentNode) {
      if (node.properties?.id === "footnote-label") {
        node.children = [{ type: "text", value: "\u811a\u6ce8" }];
      }
      if (node.properties?.dataFootnoteBackref !== undefined) {
        node.properties.ariaLabel = "\u8fd4\u56de\u811a\u6ce8\u5f15\u7528";
      }
      node.children?.forEach(localize);
    }

    localize(tree);
  };
}
