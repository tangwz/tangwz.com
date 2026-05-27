import assert from "node:assert/strict";
import test from "node:test";
import { load } from "cheerio";
import { extractMetadata, toFrontmatter } from "./lib/metadata.mjs";

test("extracts metadata from json-ld and open graph tags", () => {
  const html = `
    <html>
      <head>
        <meta property="og:description" content="Summary from og" />
        <meta property="og:image" content="https://tangwz.com/posts/demo/cover.png" />
        <link rel="canonical" href="https://tangwz.com/posts/demo/" />
        <script type="application/ld+json">
          [{
            "@type": "Article",
            "headline": "Demo Title",
            "datePublished": "2020-09-29T00:00:00+00:00",
            "dateModified": "2020-10-01T00:00:00+00:00",
            "keywords": ["distributed", "paxos"],
            "abstract": "Summary from json"
          }]
        </script>
      </head>
    </html>`;

  const metadata = extractMetadata(load(html), new Map(), "/posts/demo/");

  assert.deepEqual(metadata, {
    title: "Demo Title",
    pubDatetime: "2020-09-29T00:00:00+00:00",
    modDatetime: "2020-10-01T00:00:00+00:00",
    description: "Summary from og",
    tags: ["distributed", "paxos"],
    canonicalURL: "https://tangwz.com/posts/demo/",
    ogImage: "https://tangwz.com/posts/demo/cover.png",
    draft: false,
    fallbacks: [],
  });
});

test("uses index json fallback when html metadata is incomplete", () => {
  const html = `<html><head><title>Fallback Title - Site</title></head></html>`;
  const indexRecords = new Map([
    [
      "/posts/fallback/",
      {
        title: "Fallback Title",
        date: "2021-01-07",
        summary: "Fallback summary",
        permalink: "/posts/fallback/",
      },
    ],
  ]);

  const metadata = extractMetadata(load(html), indexRecords, "/posts/fallback/");

  assert.equal(metadata.title, "Fallback Title");
  assert.equal(metadata.pubDatetime, "2021-01-07T00:00:00+00:00");
  assert.equal(metadata.description, "Fallback summary");
  assert.deepEqual(metadata.tags, ["others"]);
  assert.equal(metadata.canonicalURL, "https://tangwz.com/posts/fallback/");
  assert.deepEqual(metadata.fallbacks.sort(), [
    "description",
    "pubDatetime",
    "tags",
    "title",
  ]);
});

test("uses html title fallback and strips site title separators", () => {
  const separator = "\u00b7";
  const html = `<html><head><title>Demo Title ${separator} Site</title></head></html>`;
  const metadata = extractMetadata(load(html), new Map(), "/posts/demo/");

  assert.equal(metadata.title, "Demo Title");
});

test("serializes frontmatter with stable field order", () => {
  const yaml = toFrontmatter({
    title: "Demo Title",
    pubDatetime: "2020-09-29T00:00:00+00:00",
    modDatetime: "2020-10-01T00:00:00+00:00",
    description: "Summary",
    tags: ["distributed"],
    canonicalURL: "https://tangwz.com/posts/demo/",
    ogImage: "./assets/cover.png",
    draft: false,
    fallbacks: [],
  });

  assert.equal(
    yaml,
    [
      "---",
      'title: "Demo Title"',
      "pubDatetime: 2020-09-29T00:00:00+00:00",
      "modDatetime: 2020-10-01T00:00:00+00:00",
      'description: "Summary"',
      "tags:",
      '  - "distributed"',
      'canonicalURL: "https://tangwz.com/posts/demo/"',
      'ogImage: "./assets/cover.png"',
      "draft: false",
      "---",
      "",
    ].join("\n")
  );
});
