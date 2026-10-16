import assert from "node:assert/strict";
import test from "node:test";
import { unified } from "@astrojs/markdown-remark";
import { rehypeLocalizedFootnotes } from "./rehypeLocalizedFootnotes.ts";

const footnotes = () => ({
  type: "root",
  children: [
    {
      type: "element",
      tagName: "section",
      children: [
        {
          type: "element",
          tagName: "h2",
          properties: { id: "footnote-label" },
          children: [{ type: "text", value: "Footnotes" }],
        },
        {
          type: "element",
          tagName: "a",
          properties: {
            href: "#user-content-fnref-note",
            dataFootnoteBackref: "",
            ariaLabel: "Back to reference 1",
          },
          children: [{ type: "text", value: "Return" }],
        },
        {
          type: "element",
          tagName: "p",
          children: [{ type: "text", value: "A useful note." }],
        },
      ],
    },
  ],
});

test("localizes Chinese footnote labels without changing text or targets", () => {
  const tree = footnotes();
  rehypeLocalizedFootnotes()(tree, {
    data: { astro: { frontmatter: { lang: "zh" } } },
  });
  const [heading, link, paragraph] = tree.children[0].children;
  assert.equal(heading.children[0].value, "\u811a\u6ce8");
  assert.equal(
    link.properties.ariaLabel,
    "\u8fd4\u56de\u811a\u6ce8\u5f15\u7528"
  );
  assert.equal(link.properties.href, "#user-content-fnref-note");
  assert.equal(paragraph.children[0].value, "A useful note.");
});

test("omitted language uses the same Chinese default as the collection", () => {
  for (const data of [{}, { astro: { frontmatter: {} } }]) {
    const expected = footnotes();
    rehypeLocalizedFootnotes()(expected, {
      data: { astro: { frontmatter: { lang: "zh" } } },
    });
    const tree = footnotes();
    rehypeLocalizedFootnotes()(tree, { data });
    assert.deepEqual(tree, expected);
  }
});

test("keeps explicitly English footnotes unchanged", () => {
  const tree = footnotes();
  const original = structuredClone(tree);
  rehypeLocalizedFootnotes()(tree, {
    data: { astro: { frontmatter: { lang: "en" } } },
  });
  assert.deepEqual(tree, original);
});

test("the Markdown renderer localizes legacy notes and preserves English notes", async () => {
  const renderer = await unified({
    rehypePlugins: [rehypeLocalizedFootnotes],
  }).createRenderer({ syntaxHighlight: false });
  const markdown = "An article with a note[^note].\n\n[^note]: A useful note.";
  for (const frontmatter of [{}, { lang: "zh" }]) {
    const { code } = await renderer.render(markdown, { frontmatter });
    assert.match(code, /id="footnote-label"[^>]*>\u811a\u6ce8<\/h2>/);
    assert.match(code, /aria-label="\u8fd4\u56de\u811a\u6ce8\u5f15\u7528"/);
    assert.match(code, /A useful note\./);
    assert.match(code, /href="#user-content-fnref-note"/);
  }
  const { code } = await renderer.render(markdown, {
    frontmatter: { lang: "en" },
  });
  assert.match(code, /id="footnote-label"[^>]*>Footnotes<\/h2>/);
  assert.match(code, /aria-label="Back to reference 1"/);
});
