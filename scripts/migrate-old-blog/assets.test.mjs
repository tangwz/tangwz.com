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
  assert.equal(isResizeDerivative("cover_hu123abc_33099_660x0_resize_q75_box.jpg"), true);
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
  assert.equal(
    originalNameForDerivative("diagram_huabcdef_33099_660x0_resize_box_3.png"),
    "diagram.png"
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

test("rejects external image URLs", async () => {
  const root = await tempMigrationDir();
  const imageUrl = "https://example.com/posts/demo/cover.jpg";

  const result = await copyReferencedAsset({
    sourceRoot: join(root, "source"),
    outputPostDir: join(root, "out", "demo"),
    postSlug: "demo",
    imageUrl,
  });

  assert.deepEqual(result, { markdownPath: "", externalUrl: imageUrl });
});

test("normalizes malformed root-prefixed external URLs", async () => {
  const root = await tempMigrationDir();
  const imageUrl = "/https://example.com/cover.jpg";

  const result = await copyReferencedAsset({
    sourceRoot: join(root, "source"),
    outputPostDir: join(root, "out", "demo"),
    postSlug: "demo",
    imageUrl,
  });

  assert.deepEqual(result, { markdownPath: "", externalUrl: "https://example.com/cover.jpg" });
});

test("rejects image URLs for a different post path", async () => {
  const root = await tempMigrationDir();
  const imageUrl = "/posts/other/cover.jpg";

  const result = await copyReferencedAsset({
    sourceRoot: join(root, "source"),
    outputPostDir: join(root, "out", "demo"),
    postSlug: "demo",
    imageUrl,
  });

  assert.deepEqual(result, { markdownPath: "", missing: imageUrl });
});

test("strips query strings and hashes before copying", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outputPostDir = join(root, "out", "demo");
  const sourceFile = join(sourceRoot, "posts", "demo", "cover.jpg");
  await mkdir(join(sourceRoot, "posts", "demo"), { recursive: true });
  await writeFile(sourceFile, "cover with query");

  const result = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl: "/posts/demo/cover.jpg?width=1200#hero",
  });

  assert.equal(result.markdownPath, "./assets/cover.jpg");
  assert.equal(result.copiedFrom, sourceFile);
  assert.equal(await readFile(result.copiedTo, "utf8"), "cover with query");
});

test("decodes percent-encoded image paths", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outputPostDir = join(root, "out", "demo");
  const sourceFile = join(sourceRoot, "posts", "demo", "a b.jpg");
  await mkdir(join(sourceRoot, "posts", "demo"), { recursive: true });
  await writeFile(sourceFile, "encoded name");

  const result = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl: "/posts/demo/a%20b.jpg",
  });

  assert.equal(result.markdownPath, "./assets/a b.jpg");
  assert.equal(result.copiedFrom, sourceFile);
  assert.equal(await readFile(result.copiedTo, "utf8"), "encoded name");
});

test("returns missing when percent encoding is malformed", async () => {
  const root = await tempMigrationDir();
  const imageUrl = "/posts/demo/bad%zz.jpg";

  const result = await copyReferencedAsset({
    sourceRoot: join(root, "source"),
    outputPostDir: join(root, "out", "demo"),
    postSlug: "demo",
    imageUrl,
  });

  assert.deepEqual(result, { markdownPath: "", missing: imageUrl });
});

test("rejects traversal outside the current post directory", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outputPostDir = join(root, "out", "demo");
  const secretFile = join(sourceRoot, "posts", "other", "secret.jpg");
  await mkdir(join(sourceRoot, "posts", "other"), { recursive: true });
  await writeFile(secretFile, "secret image");

  const imageUrl = "/posts/demo/../other/secret.jpg";
  const result = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl,
  });

  assert.deepEqual(result, { markdownPath: "", missing: imageUrl });
});

test("avoids overwriting existing target files", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outputPostDir = join(root, "out", "demo");
  const sourceFile = join(sourceRoot, "posts", "demo", "cover.jpg");
  const existingFile = join(outputPostDir, "assets", "cover.jpg");
  await mkdir(join(sourceRoot, "posts", "demo"), { recursive: true });
  await mkdir(join(outputPostDir, "assets"), { recursive: true });
  await writeFile(sourceFile, "new cover");
  await writeFile(existingFile, "existing cover");

  const result = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl: "/posts/demo/cover.jpg",
  });

  assert.equal(result.markdownPath, "./assets/cover-2.jpg");
  assert.equal(await readFile(existingFile, "utf8"), "existing cover");
  assert.equal(await readFile(result.copiedTo, "utf8"), "new cover");
});

test("copies derivative when original asset does not exist", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outputPostDir = join(root, "out", "demo");
  const derivativeName = "cover_hu123abc_1200x630_resize_q75_box.jpg";
  const sourceFile = join(sourceRoot, "posts", "demo", derivativeName);
  await mkdir(join(sourceRoot, "posts", "demo"), { recursive: true });
  await writeFile(sourceFile, "derivative image");

  const result = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl: `/posts/demo/${derivativeName}`,
  });

  assert.equal(result.markdownPath, `./assets/${derivativeName}`);
  assert.equal(result.copiedFrom, sourceFile);
  assert.equal(await readFile(result.copiedTo, "utf8"), "derivative image");
});

test("copies media assets outside post directories", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outputPostDir = join(root, "out", "demo");
  const sourceFile = join(sourceRoot, "media", "images", "demo", "cover.jpg");
  await mkdir(join(sourceRoot, "media", "images", "demo"), { recursive: true });
  await writeFile(sourceFile, "media image");

  const result = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl: "/media/images/demo/cover.jpg",
  });

  assert.equal(result.markdownPath, "./assets/cover.jpg");
  assert.equal(result.copiedFrom, sourceFile);
  assert.equal(await readFile(result.copiedTo, "utf8"), "media image");
});

test("copies same-basename image when referenced extension is wrong", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outputPostDir = join(root, "out", "demo");
  const sourceFile = join(sourceRoot, "posts", "demo", "code3.png");
  await mkdir(join(sourceRoot, "posts", "demo"), { recursive: true });
  await writeFile(sourceFile, "png image");

  const result = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug: "demo",
    imageUrl: "code3.jpg",
  });

  assert.equal(result.markdownPath, "./assets/code3.png");
  assert.equal(result.copiedFrom, sourceFile);
  assert.equal(await readFile(result.copiedTo, "utf8"), "png image");
});
