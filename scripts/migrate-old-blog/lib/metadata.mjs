function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent($, selector) {
  return cleanText($(selector).first().attr("content"));
}

function canonicalUrl($) {
  return cleanText($('link[rel="canonical"]').first().attr("href"));
}

function jsonLdEntries(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value["@graph"])) return value["@graph"];
  return [value];
}

function isArticle(entry) {
  const type = entry?.["@type"];
  return type === "Article" || (Array.isArray(type) && type.includes("Article"));
}

function firstArticleJsonLd($) {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    const raw = $(script).text();
    if (!raw.trim()) continue;

    try {
      const parsed = JSON.parse(raw);
      const article = jsonLdEntries(parsed).find(isArticle);
      if (article) return article;
    } catch {
      continue;
    }
  }

  return {};
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value.split(",").map(cleanText).filter(Boolean);
  }

  return [];
}

function htmlTitle($) {
  return cleanText($("title").first().text()).replace(/\s+(?:\u00b7|-)\s+.*$/, "");
}

function dateOnlyToIso(value) {
  const date = cleanText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return `${date}T00:00:00+00:00`;
  }

  return date;
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

export function extractMetadata($, indexRecords, permalink) {
  const article = firstArticleJsonLd($);
  const fallback = indexRecords.get(permalink) ?? {};
  const fallbacks = [];

  let title =
    cleanText(article.headline ?? article.name) ||
    metaContent($, 'meta[property="og:title"]');
  if (!title) {
    title = cleanText(fallback.title) || htmlTitle($);
    fallbacks.push("title");
  }

  let pubDatetime =
    cleanText(article.datePublished) ||
    metaContent($, 'meta[property="article:published_time"]');
  if (!pubDatetime && fallback.date) {
    pubDatetime = dateOnlyToIso(fallback.date);
    fallbacks.push("pubDatetime");
  }

  const modDatetime =
    cleanText(article.dateModified) ||
    metaContent($, 'meta[property="article:modified_time"]');

  let description =
    metaContent($, 'meta[property="og:description"]') ||
    cleanText(article.abstract) ||
    metaContent($, 'meta[name="description"]');
  if (!description && fallback.summary) {
    description = cleanText(fallback.summary);
    fallbacks.push("description");
  }

  let tags = normalizeTags(article.keywords);
  if (tags.length === 0) {
    tags = ["others"];
    fallbacks.push("tags");
  }

  const canonicalURL = canonicalUrl($) || `https://tangwz.com${permalink}`;
  const ogImage =
    metaContent($, 'meta[property="og:image"]') ||
    metaContent($, 'meta[name="twitter:image"]');

  return {
    title,
    pubDatetime,
    ...(modDatetime ? { modDatetime } : {}),
    description,
    tags,
    canonicalURL,
    ...(ogImage ? { ogImage } : {}),
    draft: false,
    fallbacks,
  };
}

export function toFrontmatter(metadata) {
  const lines = [
    "---",
    `title: ${yamlString(metadata.title)}`,
    `pubDatetime: ${metadata.pubDatetime}`,
  ];

  if (metadata.modDatetime) {
    lines.push(`modDatetime: ${metadata.modDatetime}`);
  }

  lines.push(`description: ${yamlString(metadata.description)}`);
  lines.push("tags:");
  for (const tag of metadata.tags) {
    lines.push(`  - ${yamlString(tag)}`);
  }

  if (metadata.canonicalURL) {
    lines.push(`canonicalURL: ${yamlString(metadata.canonicalURL)}`);
  }

  if (metadata.ogImage) {
    lines.push(`ogImage: ${yamlString(metadata.ogImage)}`);
  }

  lines.push("draft: false");
  lines.push("---", "");

  return lines.join("\n");
}
