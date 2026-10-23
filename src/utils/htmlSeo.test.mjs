import assert from "node:assert/strict";
import test from "node:test";
import { getLanguageAlternates } from "./htmlSeo.ts";

test("language alternates come from actual head links rather than RSS or body content", () => {
  const html =
    '<html><head><link href="https://example.com/" hreflang="en" rel="alternate"><link rel="alternate" type="application/rss+xml" href="/rss.xml"></head><body><link rel="alternate" hreflang="zh-CN" href="/zh/"></body></html>';
  assert.deepEqual(getLanguageAlternates(html), [
    { lang: "en", url: "https://example.com/" },
  ]);
});

test("alternate URLs retain parsed entities and x-default", () => {
  const html =
    '<link rel="alternate" hreflang="zh-CN" href="https://example.com/zh/?a=1&amp;b=2"><link rel="alternate" hreflang="x-default" href="https://example.com/zh/">';
  assert.deepEqual(getLanguageAlternates(html), [
    { lang: "zh-CN", url: "https://example.com/zh/?a=1&b=2" },
    { lang: "x-default", url: "https://example.com/zh/" },
  ]);
});
