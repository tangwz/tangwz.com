import assert from "node:assert/strict";
import test from "node:test";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import { rehypeMath } from "./rehypeMath.ts";
import { getMathErrors } from "./mathValidation.ts";

test("accepts greater-than signs in rendered formula labels", async () => {
  const renderer = await unified({
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMath],
  }).createRenderer({ syntaxHighlight: false });
  const { code } = await renderer.render("Inline: $x > 0$.\n\n$$\nx > 0\n$$");
  assert.match(code, /aria-label="x > 0"/);
  assert.deepEqual(getMathErrors(code), []);
});

test("checks real attributes rather than quoted formula text", () => {
  const html = `<mjx-container display="true" role="math" aria-label='x > 0; tabindex="0"'></mjx-container>`;
  assert.deepEqual(getMathErrors(html), [
    "Formula cannot receive keyboard focus",
  ]);
});

test("ignores CSS selectors and literal HTML source in code examples", () => {
  const html = `<style>g[data-mml-node="merror"] { fill: red; }</style>
<pre><code>&lt;span class="mathjax-error"&gt;&lt;/span&gt;</code></pre>`;
  assert.deepEqual(getMathErrors(html), []);
});

test("detects missing accessibility and actual rendering errors", () => {
  const html = `<mjx-container tabindex="0" aria-label=" "></mjx-container>
<span class="extra mathjax-error">Bad formula</span>
<svg><g data-mml-node="merror"></g></svg>`;
  assert.deepEqual(getMathErrors(html), [
    "Missing accessible formula label",
    "Invalid rendered formula",
  ]);
});
