import assert from "node:assert/strict";
import test from "node:test";
import { resolveColorTheme } from "./colorTheme.ts";

test("an explicit choice takes precedence over system color changes", () => {
  assert.equal(resolveColorTheme("light", true), "light");
  assert.equal(resolveColorTheme("dark", false), "dark");
});

test("new visitors and invalid stored values follow the system", () => {
  assert.equal(resolveColorTheme(null, true), "dark");
  assert.equal(resolveColorTheme(null, false), "light");
  assert.equal(resolveColorTheme("invalid", true), "dark");
});

test("disabling the optional theme feature consistently forces light mode", () => {
  assert.equal(resolveColorTheme("dark", true, false), "light");
});
