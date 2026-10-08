import assert from "node:assert/strict";
import test from "node:test";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import { rehypeMath } from "./rehypeMath.ts";

const renderer = await unified({
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeMath],
}).createRenderer({
  syntaxHighlight: { type: "shiki", excludeLangs: ["math"] },
});

const render = async source => (await renderer.render(source)).code;

test("renders inline and display math with accessible static SVG", async () => {
  const html = await render(String.raw`Energy is $E = mc^2$.

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$`);
  assert.equal((html.match(/<mjx-container\b/g) ?? []).length, 2);
  assert.equal((html.match(/role="math"/g) ?? []).length, 2);
  assert.match(html, /aria-label="E = mc\^2"/);
  assert.match(html, /display="true"[^>]*tabindex="0"/);
  assert.match(html, /<svg\b[^>]*aria-hidden="true"/);
  assert.match(html, /style="vertical-align: -[\d.]+ex;"[^>]*><svg/);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<script\b|https?:\/\/[^"\s]+\.(?:js|woff2?)/);
});

test("supports aligned equations, matrices, and piecewise functions", async () => {
  const html = await render(String.raw`$$
\begin{aligned} x &= \frac{1}{2} \\ y &= \sqrt{x} \end{aligned}
$$

$$
\begin{pmatrix} a & b \\ c & d \end{pmatrix}
$$

$$
|x| = \begin{cases} x, & x \geq 0 \\ -x, & x < 0 \end{cases}
$$`);
  assert.equal(
    (html.match(/<mjx-container\b[^>]*display="true"/g) ?? []).length,
    3
  );
  assert.doesNotMatch(
    html,
    /<(?:span|g)\b[^>]*(?:mathjax-error|data-mml-node="merror")/
  );
});

test("preserves escaped dollars and formula source inside code examples", async () => {
  const html = await render(
    "A price: \\$20. Code: `$x^2$`.\n\n```md\n$$\n\\frac{1}{2}\n$$\n```"
  );
  assert.match(html, /A price: \$20/);
  assert.match(html, /\$x\^2\$/);
  assert.match(html, /astro-code/);
  assert.doesNotMatch(html, /<mjx-container\b/);
});

test("renders math fences without changing ordinary highlighted code", async () => {
  const html = await render(
    "```math\nx^2 + y^2 = z^2\n```\n\n```js\nconst price = 20;\n```"
  );
  assert.equal((html.match(/<mjx-container\b/g) ?? []).length, 1);
  assert.match(html, /display="true"/);
  assert.match(html, /astro-code/);
  assert.doesNotMatch(html, /language-math/);
});

test("rejects malformed formulas before publishing", async context => {
  context.mock.method(console, "error", () => {});
  await assert.rejects(render(String.raw`$\frac{1}$`), /Invalid LaTeX formula/);
});

test("reports the source and position of an invalid inline formula", async context => {
  context.mock.method(console, "error", () => {});
  const source =
    "## Intro\n\nA normal paragraph.\n\n## Math\n\nEnergy is $\\frac{1}$ here.";
  await assert.rejects(
    renderer.render(source, { fileURL: new URL("file:///tmp/inline-math.md") }),
    error => {
      assert.equal(error.line, 7);
      assert.equal(error.column, 11);
      assert.match(error.reason, /Invalid LaTeX formula: \\frac\{1\}/);
      assert.match(error.cause.message, /Missing argument/);
      return true;
    }
  );
});

test("retains positions for display formulas and math fences", async context => {
  context.mock.method(console, "error", () => {});
  for (const formula of ["$$\n\\frac{1}\n$$", "```math\n\\frac{1}\n```"]) {
    await assert.rejects(
      renderer.render(`## Intro\n\nA normal paragraph.\n\n${formula}`),
      error => {
        assert.equal(error.line, 5);
        assert.equal(error.column, 1);
        assert.match(error.reason, /\\frac\{1\}/);
        return true;
      }
    );
  }
});

test("keeps custom macros within a document", async context => {
  context.mock.method(console, "error", () => {});
  const html =
    await render(String.raw`$\newcommand{\blogmacro}{\mathbb{R}}\blogmacro$

$\blogmacro$`);
  assert.equal((html.match(/<mjx-container\b/g) ?? []).length, 2);
  await assert.rejects(
    render(String.raw`$\blogmacro$`),
    /Invalid LaTeX formula/
  );
});
