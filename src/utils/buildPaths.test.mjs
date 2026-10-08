import assert from "node:assert/strict";
import test from "node:test";
import { getOutputPath } from "./buildPaths.ts";

test("root deployment paths map directly to static output", () => {
  assert.equal(getOutputPath("/favicon.svg"), "/favicon.svg");
  assert.equal(getOutputPath("/zh/posts/example/"), "/zh/posts/example/");
});

test("subdirectory deployment paths lose only the configured base", () => {
  assert.equal(
    getOutputPath("/journal/favicon.svg", "/journal/"),
    "/favicon.svg"
  );
  assert.equal(getOutputPath("/journal/zh/og.png", "/journal"), "/zh/og.png");
  assert.equal(getOutputPath("/journal/", "/journal/"), "/");
  assert.equal(getOutputPath("/journal", "/journal/"), "/");
});

test("paths outside the deployment base cannot match an output file", () => {
  assert.equal(getOutputPath("/favicon.svg", "/journal/"), undefined);
  assert.equal(
    getOutputPath("/journalism/favicon.svg", "/journal/"),
    undefined
  );
});

test("URL encoded filenames are mapped to real filesystem names", () => {
  assert.equal(
    getOutputPath("/journal/images/my%20cover.jpg", "/journal/"),
    "/images/my cover.jpg"
  );
  assert.equal(
    getOutputPath("/journal/%E4%B8%AD%E6%96%87/", "/journal/"),
    "/\u4e2d\u6587/"
  );
});
