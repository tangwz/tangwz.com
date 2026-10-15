import { parseFrontmatter, unified } from "@astrojs/markdown-remark";
import { fromHtml } from "hast-util-from-html";
import remarkMath from "remark-math";

const normalize = value => value.replace(/\s+/g, " ").trim();
const text = node =>
  node.type === "text" ? node.value : (node.children ?? []).map(text).join("");
const visit = (node, inspect) => {
  inspect(node);
  node.children?.forEach(child => visit(child, inspect));
};

export async function sourceFormulas(markdown) {
  const formulas = [];
  const collect = () => tree =>
    visit(tree, node => {
      if (
        ["math", "inlineMath"].includes(node.type) ||
        (node.type === "code" && node.lang === "math")
      )
        formulas.push(normalize(node.value));
    });
  const renderer = await unified({
    remarkPlugins: [remarkMath, collect],
  }).createRenderer({ syntaxHighlight: false });
  await renderer.render(parseFrontmatter(markdown).content);
  return formulas;
}

export function formulaCoverageErrors(expected, actual) {
  const remaining = [...actual];
  const errors = [];
  for (const formula of expected) {
    const index = remaining.indexOf(normalize(formula));
    if (index < 0) errors.push(`Missing rendered formula: ${formula}`);
    else remaining.splice(index, 1);
  }
  for (const formula of remaining)
    errors.push(`Unexpected rendered formula: ${formula}`);
  return errors;
}

export function inspectPage(html, sampleNotices = []) {
  const result = {
    formulas: [],
    errors: [],
    article: undefined,
    language: undefined,
  };
  const visible = [];
  let heading;
  const inspect = node => {
    if (node.type === "element") {
      const { properties, tagName } = node;
      if (tagName === "html") result.language = properties.lang;
      if (tagName === "h1" && heading === undefined)
        heading = normalize(text(node));
      if (tagName === "script" && properties.type === "application/ld+json") {
        const data = JSON.parse(text(node));
        if (data["@type"] === "BlogPosting")
          result.article = {
            title: data.headline,
            language: data.inLanguage,
          };
      }
      if (["code", "pre", "style", "script"].includes(tagName)) return;
      const classes = properties.className ?? [];
      if (
        classes.some(name =>
          ["work-sample-label", "sample-notice", "theme-sample"].includes(name)
        ) ||
        properties.dataSample === "true"
      )
        result.errors.push("Theme sample content is present");
      if (tagName === "mjx-container") {
        const formula = normalize(String(properties.ariaLabel ?? ""));
        result.formulas.push(formula);
        let rendered = false;
        visit(node, child => {
          if (
            child.type === "element" &&
            child.tagName === "svg" &&
            child.children.length > 0
          )
            rendered = true;
        });
        if (!rendered)
          result.errors.push(`Formula has no rendered SVG: ${formula}`);
      }
    }
    if (node.type === "text") visible.push(node.value);
    node.children?.forEach(inspect);
  };
  inspect(fromHtml(html));
  if (result.article && heading !== undefined) result.article.title = heading;
  const content = normalize(visible.join(" "));
  for (const notice of sampleNotices)
    if (content.includes(normalize(notice)))
      result.errors.push(`Theme sample notice is present: ${notice}`);
  return result;
}

export const sampleNotices = [
  "Theme example. This content demonstrates the layout and features.",
  "This is a sample reading note for the theme, rather than a personal review. Replace it with your own notes and reflections.",
  "This is a sample letter included with the theme.",
  "A sample reading shelf for this theme. Cover designs are illustrative.",
  "This collection includes sample essays from the theme.",
  "A proposed course outline for the theme. The programme, timing, and pricing will be announced when ready.",
  "This preview episode includes a sample transcript. The video is not published yet.",
];
