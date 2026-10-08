import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicImagePath,
  prefixAssetPath,
  resolveCoverImage,
} from "./assetPaths.ts";

test("public image URLs are distinguished from local image imports", () => {
  for (const path of [
    "/images/cover.jpg",
    "//cdn.example.com/cover.jpg",
    "https://cdn.example.com/cover.jpg",
    "data:image/svg+xml;base64,PHN2Zy8+",
  ]) {
    assert.equal(isPublicImagePath(path), true, path);
  }
  for (const path of [
    "../../assets/images/cover.jpg",
    "./cover.jpg",
    "assets/cover.jpg",
  ]) {
    assert.equal(isPublicImagePath(path), false, path);
  }
});

test("asset paths respect root and subdirectory deployments", () => {
  assert.equal(prefixAssetPath("images/cover.jpg"), "/images/cover.jpg");
  assert.equal(
    prefixAssetPath("/images/cover.jpg", "/journal/"),
    "/journal/images/cover.jpg"
  );
  assert.equal(prefixAssetPath("", "/journal/"), "/journal");
  assert.equal(prefixAssetPath(""), "/");
});

test("already based paths are not prefixed twice", () => {
  assert.equal(
    prefixAssetPath("/journal/images/cover.jpg", "/journal"),
    "/journal/images/cover.jpg"
  );
  assert.equal(
    prefixAssetPath("/journalism/cover.jpg", "/journal/"),
    "/journal/journalism/cover.jpg"
  );
});

test("string covers preserve query parameters and fragments under the base", () => {
  assert.equal(
    resolveCoverImage("/images/cover.jpg?size=large#preview", "/journal/"),
    "/journal/images/cover.jpg?size=large#preview"
  );
  assert.equal(resolveCoverImage("/images/cover.jpg"), "/images/cover.jpg");
  assert.equal(
    resolveCoverImage("/journal/images/cover.jpg", "/journal/"),
    "/journal/images/cover.jpg"
  );
});

test("external and relative cover URLs stay unchanged", () => {
  for (const image of [
    "https://cdn.example.com/cover.jpg",
    "//cdn.example.com/cover.jpg",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "../images/cover.jpg",
  ]) {
    assert.equal(resolveCoverImage(image, "/journal/"), image);
  }
  assert.equal(
    prefixAssetPath("https://cdn.example.com/cover.jpg", "/journal/"),
    "https://cdn.example.com/cover.jpg"
  );
  assert.equal(
    prefixAssetPath("//cdn.example.com/cover.jpg", "/journal/"),
    "//cdn.example.com/cover.jpg"
  );
});

test("imported image metadata and missing covers stay unchanged", () => {
  const image = {
    src: "/journal/_astro/cover.hash.webp",
    width: 1200,
    height: 630,
  };
  assert.equal(resolveCoverImage(image, "/journal/"), image.src);
  assert.equal(resolveCoverImage(undefined, "/journal/"), undefined);
});
