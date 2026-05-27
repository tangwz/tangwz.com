import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import {
  copyReferencedAsset,
  isResizeDerivative,
  originalNameForDerivative,
} from "./lib/assets.mjs";

async function tempMigrationDir() {
  return mkdtemp(join(tmpdir(), "old-blog-assets-"));
}

test("detects Hugo resize derivative names", () => {
  assert.equal(isResizeDerivative("cover_hu123abc_1200x630_resize_q75_box.jpg"), true);
  assert.equal(isResizeDerivative("diagram_huabcdef_640x0_resize_box_3.png"), true);
  assert.equal(isResizeDerivative("cover.jpg"), false);
  assert.equal(isResizeDerivative("cover_hu123abc.jpg"), false);
});

test("derives original file names from resize derivative names", () => {
  assert.equal(
    originalNameForDerivative("cover_hu123abc_1200x630_resize_q75_box.jpg"),
    "cover.jpg"
  );
  assert.equal(
    originalNameForDerivative("diagram.final_huabcdef_640x0_resize_box_3.png"),
    "diagram.final.png"
  );
  assert.equal(originalNameForDerivative("cover.jpg"), "cover.jpg");
});

test("copies original asset and returns Markdown relative path", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outputPostDir = join(root, "out", "demo");
  const sourceFile = join(sourceRoot, "posts", "demo", "cover.jpg");
  await mkdir(join(sourceRoot, "posts", "demo"), { recursive: true });
  await writeFile(sourceFile, "original image");

  const result = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl: "https://tangwz.com/posts/demo/cover_hu123abc_1200x630_resize_q75_box.jpg",
  });

  assert.equal(result.markdownPath, "./assets/cover.jpg");
  assert.equal(result.copiedFrom, sourceFile);
  assert.equal(result.copiedTo, join(outputPostDir, "assets", "cover.jpg"));
  assert.equal(await readFile(result.copiedTo, "utf8"), "original image");
});

test("reuses an already copied source asset", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outputPostDir = join(root, "out", "demo");
  const sourceFile = join(sourceRoot, "posts", "demo", "hero.png");
  await mkdir(join(sourceRoot, "posts", "demo"), { recursive: true });
  await writeFile(sourceFile, "hero image");

  const copiedBySource = new Map();
  const usedNames = new Set();

  const first = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl: "/posts/demo/hero_hu123abc_1200x630_resize_q75_box.png",
    usedNames,
    copiedBySource,
  });

  const second = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl: "https://tangwz.com/posts/demo/hero.png",
    usedNames,
    copiedBySource,
  });

  assert.equal(first.markdownPath, "./assets/hero.png");
  assert.equal(second.markdownPath, "./assets/hero.png");
  assert.equal(second.copiedFrom, sourceFile);
  assert.equal(second.copiedTo, join(outputPostDir, "assets", "hero.png"));
  assert.equal(second.reused, true);
  assert.deepEqual([...usedNames], ["hero.png"]);
});

test("avoids output name collisions with used names", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outputPostDir = join(root, "out", "demo");
  const sourceFile = join(sourceRoot, "posts", "demo", "cover.jpg");
  await mkdir(join(sourceRoot, "posts", "demo"), { recursive: true });
  await writeFile(sourceFile, "cover image");

  const result = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl: "/posts/demo/cover.jpg",
    usedNames: new Set(["cover.jpg"]),
  });

  assert.equal(result.markdownPath, "./assets/cover-2.jpg");
  assert.equal(result.copiedTo, join(outputPostDir, "assets", "cover-2.jpg"));
  assert.equal(await readFile(result.copiedTo, "utf8"), "cover image");
});

test("returns missing result when source cannot be found", async () => {
  const root = await tempMigrationDir();
  const imageUrl = "/posts/demo/missing.jpg";

  const result = await copyReferencedAsset({
    sourceRoot: join(root, "source"),
    outputPostDir: join(root, "out", "demo"),
    postSlug: "demo",
    imageUrl,
  });

  assert.deepEqual(result, { markdownPath: "", missing: imageUrl });
});
