import assert from "node:assert/strict";
import test from "node:test";
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

test("keeps English and unspecified-language footnotes unchanged", () => {
  for (const data of [{}, { astro: { frontmatter: { lang: "en" } } }]) {
    const tree = footnotes();
    const original = structuredClone(tree);
    rehypeLocalizedFootnotes()(tree, { data });
    assert.deepEqual(tree, original);
  }
});
