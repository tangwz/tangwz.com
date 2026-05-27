import { load } from "cheerio";
import TurndownService from "turndown";

const EXACT_ARTICLE_BODY_SELECTOR = "article .min-w-0.min-h-0.max-w-prose";
const PROSE_ARTICLE_BODY_SELECTOR = "article .max-w-prose";

const GENERATED_SELECTORS = [
  "script",
  "style",
  "noscript",
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
  const exactMatches = $(EXACT_ARTICLE_BODY_SELECTOR).toArray();
  if (exactMatches.length > 0) {
    return mostContentRich($, exactMatches);
  }

  const proseMatches = $(PROSE_ARTICLE_BODY_SELECTOR).toArray();
  if (proseMatches.length > 0) {
    return mostContentRich($, proseMatches);
  }

  const articleMatches = $("article").toArray();
  if (articleMatches.length > 0) {
    return mostContentRich($, articleMatches);
  }

  return $("body").first();
}

function stripUnsupportedControlCharacters(value) {
  return String(value ?? "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function contentScore($, node) {
  const element = $(node);
  const textScore = element.text().replace(/\s+/g, " ").trim().length;
  const mediaScore = element.find("img, pre").length * 200;
  const blockScore = element.find("p, blockquote, ul, ol, table, details").length * 50;
  return textScore + mediaScore + blockScore;
}

function mostContentRich($, nodes) {
  const [firstNode] = nodes;
  let bestNode = firstNode;
  let bestScore = contentScore($, firstNode);

  for (const node of nodes.slice(1)) {
    const score = contentScore($, node);
    if (score > bestScore) {
      bestNode = node;
      bestScore = score;
    }
  }

  return $(bestNode);
}

function normalizeWhitespace(value) {
  return stripUnsupportedControlCharacters(value)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeCodeText(value) {
  return stripUnsupportedControlCharacters(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

function normalizeChromaLineText(value) {
  return stripUnsupportedControlCharacters(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n+$/, "");
}

function attributeText($, node) {
  return ["class", "id", "role", "aria-label", "data-toc"]
    .map(attr => $(node).attr(attr) ?? "")
    .join(" ");
}

function hasTocMarker($, node) {
  return /\b(?:toc|table[-\s]?of[-\s]?contents|contents)\b/i.test(attributeText($, node));
}

function allLinksAreLocalAnchors($, node) {
  const links = $(node).find("a[href]").toArray();
  return links.length > 0 && links.every(link => ($(link).attr("href") ?? "").startsWith("#"));
}

function isGeneratedDetails($, node) {
  const summaryText = normalizeWhitespace($(node).children("summary").first().text());
  return (
    hasTocMarker($, node) ||
    /\b(?:toc|table[-\s]?of[-\s]?contents|contents)\b/i.test(summaryText) ||
    allLinksAreLocalAnchors($, node)
  );
}

function isGeneratedNav($, node) {
  return hasTocMarker($, node) || allLinksAreLocalAnchors($, node);
}

function isGeneratedFooter($, node) {
  const text = normalizeWhitespace($(node).text());
  return (
    hasTocMarker($, node) ||
    /\b(?:published by|powered by|copyright|all rights reserved)\b/i.test(text)
  );
}

function removeGeneratedNodes($) {
  $(GENERATED_SELECTORS.join(",")).remove();
  $("details").filter((_, node) => isGeneratedDetails($, node)).remove();
  $("nav").filter((_, node) => isGeneratedNav($, node)).remove();
  $("footer").filter((_, node) => isGeneratedFooter($, node)).remove();
  $(".footnotes hr, a.footnote-backref, a[role='doc-backlink']").remove();

  $("h1, h2, h3, h4, h5, h6").each((_, heading) => {
    $(heading)
      .find("a")
      .filter((__, anchor) => {
        const href = $(anchor).attr("href") ?? "";
        const ariaHidden = $(anchor).attr("aria-hidden") === "true";
        const className = $(anchor).attr("class") ?? "";
        const text = normalizeWhitespace($(anchor).text());
        return (
          href.startsWith("#") &&
          (ariaHidden || /\banchor\b/.test(className) || text === "#")
        );
      })
      .remove();
  });
}

function removeDanglingAnchorMarkers($) {
  $("p, li").each((_, node) => {
    const element = $(node);
    if (element.children().length > 0) return;

    const text = element.text();
    const cleaned = text.replace(/([^A-Za-z0-9_])#\s*$/u, "$1").trimEnd();
    if (cleaned !== text) element.text(cleaned);
  });
}

function removeUnsupportedControlCharacters($, root) {
  $(root)
    .contents()
    .each((_, node) => {
      if (node.type === "text") {
        node.data = stripUnsupportedControlCharacters(node.data);
        return;
      }

      removeUnsupportedControlCharacters($, node);
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

    const lineNodes = codeNode.find(".line").toArray();
    const lines = lineNodes.map(line => normalizeChromaLineText($(line).text()));
    const rawCode = lines.length > 0 ? lines.join("\n") : codeNode.text();
    const code = normalizeCodeText(rawCode);

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
  removeUnsupportedControlCharacters($, $("main").get(0));
  removeGeneratedNodes($);
  removeDanglingAnchorMarkers($);
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
    const code = normalizeCodeText(codeNode.textContent);
    return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
  },
});

turndown.addRule("footnoteReference", {
  filter(node) {
    return (
      node.nodeName === "SUP" &&
      /^fnref:/.test(node.getAttribute("id") ?? "") &&
      node.querySelector("a[href^='#fn:']")
    );
  },
  replacement(_content, node) {
    const href = node.querySelector("a[href^='#fn:']")?.getAttribute("href") ?? "";
    const id = href.replace(/^#fn:/, "");
    return id ? `[^${id}]` : "";
  },
});

turndown.addRule("footnoteItem", {
  filter(node) {
    return node.nodeName === "LI" && /^fn:/.test(node.getAttribute("id") ?? "");
  },
  replacement(content, node) {
    const id = (node.getAttribute("id") ?? "").replace(/^fn:/, "");
    const footnote = trimMarkdown(content);
    return id && footnote ? `\n\n[^${id}]: ${footnote}\n\n` : "";
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
