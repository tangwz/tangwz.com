import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import { rehypeMath } from "../src/utils/rehypeMath.ts";
import {
  formulaCoverageErrors,
  inspectPage,
  sampleNotices,
  sourceFormulas,
} from "./site-content.mjs";

test("formula coverage rejects a disabled renderer and a changed expression", async () => {
  const markdown = "Inline $x > 0$, repeated $x > 0$.\n\n$$\ny = x^2\n$$";
  const expected = await sourceFormulas(markdown);
  const renderer = await unified({
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMath],
  }).createRenderer({ syntaxHighlight: false });
  const { code } = await renderer.render(markdown);
  const page = inspectPage(code);
  assert.deepEqual(formulaCoverageErrors(expected, page.formulas), []);
  assert.deepEqual(page.errors, []);
  assert.equal(formulaCoverageErrors(expected, []).length, 3);
  assert.match(
    formulaCoverageErrors(expected, ["x > 0", "x > 0", "y = x^3"]).join(),
    /Missing rendered formula: y = x\^2/
  );
});

test("formula sources exclude frontmatter, escapes and ordinary code", async () => {
  const markdown = [
    "---",
    'title: "$metadata$"',
    "---",
    "Escaped \\$literal\\$ and `$code$`.",
    "```text",
    "$code$",
    "```",
    "```math",
    "x > 0",
    "```",
    "$$",
    "y = x^2",
    "$$",
  ].join("\n");
  assert.deepEqual(await sourceFormulas(markdown), ["x > 0", "y = x^2"]);
  assert.deepEqual(formulaCoverageErrors([], []), []);
});

test("empty formula containers cannot satisfy source coverage", () => {
  const page = inspectPage(
    '<mjx-container aria-label="x > 0"></mjx-container>'
  );
  assert.match(page.errors.join(), /Formula has no rendered SVG/);
});

test("article identity uses the heading without the site title suffix", () => {
  const page = inspectPage(`<html lang="zh"><head>
<script type="application/ld+json">{"@type":"BlogPosting","headline":"Essay | Blog","inLanguage":"zh"}</script>
</head><body><h1>Essay</h1></body></html>`);
  assert.deepEqual(page.article, { title: "Essay", language: "zh" });
  assert.equal(page.language, "zh");
});

test("sample badges are rejected even on noindex pages", () => {
  for (const marker of ["work-sample-label", "sample-notice", "theme-sample"]) {
    const page = inspectPage(
      `<meta name="robots" content="noindex"><p class="extra ${marker}">Example</p>`
    );
    assert.match(page.errors.join(), /Theme sample content/);
  }
  assert.match(
    inspectPage('<article data-sample="true"></article>').errors.join(),
    /Theme sample content/
  );
});

test("sample notices are rejected in both languages, without flagging code", async () => {
  const translations = JSON.parse(
    await readFile(
      new URL("../src/i18n/messages/zh.json", import.meta.url),
      "utf8"
    )
  );
  const notices = sampleNotices
    .flatMap(value => [value, translations[value]])
    .filter(Boolean);
  for (const value of notices)
    assert.match(
      inspectPage(`<p>${value}</p>`, notices).errors.join(),
      /Theme sample notice/
    );
  assert.deepEqual(
    inspectPage(
      '<pre><code>&lt;p class="sample-notice"&gt;Example&lt;/p&gt;</code></pre><p>My sample application.</p>',
      notices
    ).errors,
    []
  );
});
