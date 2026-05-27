import { load } from "cheerio";
import TurndownService from "turndown";

const ARTICLE_BODY_SELECTORS = [
  "article .min-w-0.min-h-0.max-w-prose",
  "article .max-w-prose",
  "article",
];

const GENERATED_SELECTORS = [
  "script",
  "style",
  "noscript",
  "details",
  "footer",
  "nav",
  "[data-pagefind-body]",
  "[data-pagefind-ignore]",
];

const STYLE_ARTIFACT_ATTRIBUTES = [
  "class",
  "style",
  "srcset",
  "sizes",
  "width",
  "height",
  "loading",
  "decoding",
];

function firstArticleBody($) {
  for (const selector of ARTICLE_BODY_SELECTORS) {
    const match = $(selector).first();
    if (match.length > 0) return match;
  }

  return $("body").first();
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeGeneratedNodes($) {
  $(GENERATED_SELECTORS.join(",")).remove();

  $("h1, h2, h3, h4, h5, h6").each((_, heading) => {
    $(heading)
      .children("a")
      .filter((__, anchor) => {
        const href = $(anchor).attr("href") ?? "";
        const ariaHidden = $(anchor).attr("aria-hidden") === "true";
        const className = $(anchor).attr("class") ?? "";
        return href.startsWith("#") && (ariaHidden || /\banchor\b/.test(className));
      })
      .remove();
  });
}

function unwrapThemeFigures($) {
  $("figure").each((_, figure) => {
    const node = $(figure);
    if (node.children("figcaption").length > 0) return;

    const children = node.children().toArray();
    if (children.length === 1 && children[0]?.tagName === "img") {
      node.replaceWith(children[0]);
    }
  });
}

function cleanCodeBlocks($) {
  $("pre").each((_, pre) => {
    const preNode = $(pre);
    const codeNode = preNode.find("code").first();
    if (codeNode.length === 0) return;

    const language =
      codeNode.attr("data-lang") ||
      (codeNode.attr("class") ?? "")
        .split(/\s+/)
        .find(className => className.startsWith("language-"))
        ?.replace(/^language-/, "");

    const lines = codeNode
      .find(".line")
      .toArray()
      .map(line => $(line).text())
      .filter(line => line.trim().length > 0);
    const rawCode = lines.length > 0 ? lines.join("\n") : codeNode.text();
    const code = normalizeWhitespace(rawCode);

    codeNode.empty().text(code);
    codeNode.removeAttr("class");
    if (language) codeNode.attr("data-lang", language);
    preNode.contents().not(codeNode).remove();
  });
}

function removeStyleArtifacts($) {
  $("*").each((_, node) => {
    for (const attr of STYLE_ARTIFACT_ATTRIBUTES) {
      $(node).removeAttr(attr);
    }
  });
}

function unwrapThemeContainers($) {
  $("div, section").each((_, node) => {
    $(node).replaceWith($(node).contents());
  });
}

function cleanFragment(html) {
  const $ = load(`<main>${html}</main>`, null, false);

  cleanCodeBlocks($);
  removeGeneratedNodes($);
  unwrapThemeFigures($);
  removeStyleArtifacts($);
  unwrapThemeContainers($);

  return $("main").html() ?? "";
}

function trimMarkdown(value) {
  return String(value ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function codeLanguage(node) {
  const dataLang = node.getAttribute("data-lang");
  if (dataLang) return dataLang;

  const className = node.getAttribute("class") ?? "";
  const languageClass = className
    .split(/\s+/)
    .find(value => value.startsWith("language-") || value.startsWith("lang-"));

  return languageClass?.replace(/^(?:language|lang)-/, "") ?? "";
}

const turndown = new TurndownService({
  codeBlockStyle: "fenced",
  fence: "```",
  headingStyle: "atx",
});

turndown.addRule("fencedCodeBlockWithDataLang", {
  filter(node) {
    return node.nodeName === "PRE" && node.firstChild?.nodeName === "CODE";
  },
  replacement(_content, node) {
    const codeNode = node.firstChild;
    const language = codeLanguage(codeNode);
    const code = normalizeWhitespace(codeNode.textContent);
    return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
  },
});

turndown.addRule("standaloneImage", {
  filter(node) {
    return node.nodeName === "P" && node.childNodes.length === 1 && node.firstChild?.nodeName === "IMG";
  },
  replacement(_content, node) {
    const image = node.firstChild;
    const alt = image.getAttribute("alt") ?? "";
    const src = image.getAttribute("src") ?? "";
    const title = image.getAttribute("title");
    const titlePart = title ? ` "${title}"` : "";
    return `\n\n![${alt}](${src}${titlePart})\n\n`;
  },
});

export function extractArticleHtml($) {
  const articleBody = firstArticleBody($);
  return cleanFragment(articleBody.html() ?? "");
}

export function htmlToMarkdown(html) {
  const cleanHtml = cleanFragment(html);
  return trimMarkdown(turndown.turndown(cleanHtml));
}
