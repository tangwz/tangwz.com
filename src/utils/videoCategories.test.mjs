import assert from "node:assert/strict";
import test from "node:test";
import { getVideoCategories } from "./videoCategories.ts";

const video = (...categories) => ({ data: { categories } });

test("all content categories remain browsable without requiring featured videos", () => {
  const categories = getVideoCategories([
    video("Creativity"),
    video("Programming", "Creativity"),
    video("Productivity"),
  ]);
  assert.deepEqual(
    categories.map(category => category.name),
    ["Productivity", "Programming", "Creativity"]
  );
  assert.equal(categories.at(-1).slug, "creativity");
});

test("custom category anchors cannot collide with presets or each other", () => {
  const categories = getVideoCategories([
    video("Foo Bar", "Foo-Bar", "productivity", "!!!", "???"),
  ]);
  const slugs = categories.map(category => category.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(slugs.includes("productivity"), false);
  assert.equal(
    categories.find(category => category.name === "productivity").slug,
    "productivity-2"
  );
  assert.equal(slugs.every(Boolean), true);
});

test("custom category anchors are stable when content order changes", () => {
  const videos = [video("Foo Bar"), video("Foo-Bar", "Creativity")];
  assert.deepEqual(
    getVideoCategories(videos),
    getVideoCategories(videos.toReversed())
  );
});

test("empty archives have no category sections and non-Latin names are retained", () => {
  assert.deepEqual(getVideoCategories([]), []);
  const name = "\u7f16\u7a0b";
  const [category] = getVideoCategories([video(name)]);
  assert.equal(category.name, name);
  assert.equal(category.slug, name);
});
