import assert from "node:assert/strict";
import test from "node:test";
import { load } from "cheerio";
import { extractArticleHtml, htmlToMarkdown } from "./lib/content.mjs";

test("extracts article body and removes old theme wrappers", () => {
  const html = `
    <html>
      <body>
        <article class="theme-article">
          <div class="max-w-screen-xl">
            <div class="min-w-0 min-h-0 max-w-prose prose dark:prose-invert">
              <div class="content-wrapper">
                <h1>
                  <a class="anchor" href="#demo" aria-hidden="true">
                    <span class="anchor-icon">#</span>
                  </a>
                  Demo Title
                </h1>
                <p class="lead" style="color: red">Body text</p>
              </div>
            </div>
          </div>
        </article>
      </body>
    </html>`;

  const extracted = extractArticleHtml(load(html));
  const $ = load(extracted);

  assert.equal($("h1").text().trim(), "Demo Title");
  assert.equal($("p").text().trim(), "Body text");
  assert.equal($("[class]").length, 0);
  assert.equal($("[style]").length, 0);
  assert.equal($(".max-w-screen-xl").length, 0);
});

test("falls back to article when no prose body selector exists", () => {
  const html = `
    <html>
      <body>
        <article>
          <section>
            <h2>Fallback Heading</h2>
            <p>Fallback body</p>
          </section>
        </article>
      </body>
    </html>`;

  const extracted = extractArticleHtml(load(html));
  const $ = load(extracted);

  assert.equal($("h2").text().trim(), "Fallback Heading");
  assert.equal($("p").text().trim(), "Fallback body");
});

test("removes old style artifacts and generated article nodes", () => {
  const html = `
    <article>
      <div class="min-w-0 min-h-0 max-w-prose">
        <details open>
          <summary>Table of contents</summary>
          <nav><a href="#one">One</a></nav>
        </details>
        <h2 id="one">
          <a href="#one" class="anchor" aria-hidden="true"><span>#</span></a>
          First Section
        </h2>
        <p class="text-lg" style="font-size: 18px">
          <a href="/about"><span>About</span></a>
        </p>
        <figure class="kg-card kg-image-card">
          <img
            class="rounded"
            style="width: 100%"
            src="/posts/demo/cover.jpg"
            srcset="/posts/demo/cover-small.jpg 600w"
            sizes="(min-width: 768px) 768px, 100vw"
            alt="Cover"
          />
        </figure>
        <footer><p>Published by theme</p></footer>
        <script>window.oldTheme = true;</script>
      </div>
    </article>`;

  const extracted = extractArticleHtml(load(html));
  const $ = load(extracted);

  assert.equal($("details, nav, footer, script").length, 0);
  assert.equal($("a.anchor, h2 > a[aria-hidden]").length, 0);
  assert.equal($("h2").text().trim(), "First Section");
  assert.equal($("a[href='/about']").text().trim(), "About");
  assert.equal($("figure").length, 0);
  assert.equal($("img").attr("src"), "/posts/demo/cover.jpg");
  assert.equal($("img").attr("alt"), "Cover");
  assert.equal($("[class], [style], [srcset], [sizes]").length, 0);
});

test("converts clean article html to maintainable markdown", () => {
  const html = `
    <h2>Section Title</h2>
    <p>Read the <a href="https://example.com/docs">docs</a>.</p>
    <blockquote>
      <p>Important quote.</p>
    </blockquote>
    <pre><code class="language-js">const value = 1;
console.log(value);
</code></pre>
    <p><img src="./assets/diagram.png" alt="Architecture diagram" /></p>`;

  const markdown = htmlToMarkdown(html);

  assert.equal(
    markdown,
    [
      "## Section Title",
      "",
      "Read the [docs](https://example.com/docs).",
      "",
      "> Important quote.",
      "",
      "```js",
      "const value = 1;",
      "console.log(value);",
      "```",
      "",
      "![Architecture diagram](./assets/diagram.png)",
    ].join("\n")
  );
});

test("preserves code text without Chroma span noise", () => {
  const html = `
    <div class="highlight">
      <pre tabindex="0" class="chroma"><code data-lang="go">
        <span class="line"><span class="cl"><span class="kd">func</span> <span class="nf">main</span>() {</span></span>
        <span class="line"><span class="cl">  <span class="nx">println</span>(<span class="s">"ok"</span>)</span></span>
        <span class="line"><span class="cl">}</span></span>
      </code></pre>
    </div>`;

  const markdown = htmlToMarkdown(extractArticleHtml(load(`<article>${html}</article>`)));

  assert.equal(markdown, ['```go', "func main() {", '  println("ok")', "}", "```"].join("\n"));
});
