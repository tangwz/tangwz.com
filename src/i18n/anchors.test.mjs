import assert from "node:assert/strict";
import test from "node:test";
import { createAnchorMap, remapLocaleHash } from "./anchors.ts";

const english = [
  { depth: 2, slug: "getting-started" },
  { depth: 3, slug: "configuration" },
];
const chinese = [
  { depth: 2, slug: "\u5f00\u59cb" },
  { depth: 3, slug: "\u914d\u7f6e" },
];

test("translated outlines preserve reading position in both directions", () => {
  const hash = remapLocaleHash(
    "#configuration",
    createAnchorMap(english, chinese)
  );
  assert.equal(hash, "#%E9%85%8D%E7%BD%AE");
  assert.equal(
    remapLocaleHash(hash, createAnchorMap(chinese, english)),
    "#configuration"
  );
});

test("different outlines do not guess an unrelated section", () => {
  const map = createAnchorMap(english, [chinese[0]]);
  assert.equal(remapLocaleHash("#configuration", map), "");
  assert.equal(remapLocaleHash("#main-content", map), "#main-content");
});

test("shared IDs survive reordering and malformed or unknown fragments clear", () => {
  const map = createAnchorMap(english, [...english].reverse());
  assert.equal(remapLocaleHash("#configuration", map), "#configuration");
  assert.equal(remapLocaleHash("#missing", map), "");
  assert.equal(remapLocaleHash("#%E0", map), "");
  assert.equal(remapLocaleHash("#constructor", map), "");
  assert.equal(remapLocaleHash("", map), "");
});
