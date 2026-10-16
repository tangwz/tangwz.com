import rehypeMathjax from "rehype-mathjax/svg";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

type MathTree = Parameters<ReturnType<typeof rehypeMathjax>>[0];
type MathFile = Parameters<ReturnType<typeof rehypeMathjax>>[1];
type MathNode = MathTree | MathTree["children"][number];
type MathSource = { value: string; position?: MathNode["position"] };

const textContent = (node: MathNode): string => {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textContent).join("") : "";
};

export function rehypeMath() {
  const render = rehypeMathjax({
    tex: {
      packages: AllPackages.filter(
        name => name !== "noerrors" && name !== "noundefined"
      ),
      formatError(_jax, error) {
        throw new Error(String(error.message));
      },
    },
  });

  return (tree: MathTree, file: MathFile) => {
    const sources: MathSource[] = [];
    const collect = (node: MathNode, parent?: MathNode) => {
      if (node.type === "element") {
        const classes = node.properties.className;
        if (
          Array.isArray(classes) &&
          classes.some(name =>
            ["language-math", "math-inline", "math-display"].includes(
              String(name)
            )
          )
        ) {
          sources.push({
            value: textContent(node).trim(),
            position: node.position ?? parent?.position,
          });
          return;
        }
      }
      if ("children" in node)
        node.children.forEach(child => collect(child, node));
    };
    collect(tree);
    if (!sources.length) return;

    render(tree, file);

    let index = 0;
    const enhance = (node: MathNode) => {
      if (node.type === "element") {
        if (node.properties.className?.toString() === "mathjax-error") {
          const formula = sources[index];
          file.fail(`Invalid LaTeX formula: ${formula.value}`, {
            cause: new Error(String(node.properties.title)),
            place: formula.position,
            ruleId: "invalid-math",
            source: "rehype-math",
          });
        }
        if (node.tagName === "mjx-container") {
          // SVG paths need a readable alternative and keyboard scrolling.
          node.properties.role = "math";
          node.properties.ariaLabel = sources[index++].value;
          node.properties.tabIndex = 0;
          for (const child of node.children) {
            if (child.type === "element" && child.tagName === "svg") {
              child.properties.ariaHidden = "true";
              child.properties.focusable = "false";
              if (!node.properties.display) {
                // Preserve the SVG baseline when its container becomes scrollable.
                const alignment = String(child.properties.style).match(
                  /(?:^|;)\s*vertical-align:\s*([^;]+)/
                );
                if (alignment)
                  node.properties.style = `vertical-align: ${alignment[1]};`;
              }
            }
          }
          return;
        }
      }
      if ("children" in node) node.children.forEach(enhance);
    };
    enhance(tree);
  };
}
