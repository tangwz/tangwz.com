import assert from "node:assert/strict";
import test from "node:test";
import {
  switchLocaleUrl as switchLocaleUrlWithDefault,
  selectLocalizedEntries,
  getEntryLocales,
} from "./routing.ts";

const switchLocaleUrl = (value, locale, base = "/") =>
  switchLocaleUrlWithDefault(value, locale, base, "en");

test("Chinese root URLs preserve the legacy permalink and switch to English", () => {
  assert.equal(
    switchLocaleUrlWithDefault("/posts/essay/?page=2#section", "en"),
    "/en/posts/essay/?page=2#section"
  );
  assert.equal(
    switchLocaleUrlWithDefault("/en/posts/essay/?page=2#section", "zh"),
    "/posts/essay/?page=2#section"
  );
  assert.equal(switchLocaleUrlWithDefault("/404.html", "en"), "/en/404/");
  assert.equal(switchLocaleUrlWithDefault("/en/404/", "zh"), "/404.html");
  assert.equal(
    switchLocaleUrlWithDefault("/journal/en/works/", "zh", "/journal/"),
    "/journal/works/"
  );
});

test("content alternates include only real language entries for the same slug", () => {
  const english = { id: "examples/essay", data: { lang: "en" } };
  const chinese = { id: "zh/examples/essay", data: { lang: "zh" } };
  const unrelated = { id: "zh/another-essay", data: { lang: "zh" } };
  assert.deepEqual(getEntryLocales(english, [english, unrelated]), ["en"]);
  assert.deepEqual(getEntryLocales(chinese, [chinese]), ["zh"]);
  assert.deepEqual(getEntryLocales(english, [chinese, english]), ["en", "zh"]);
});

test("draft translations never become public language alternates", () => {
  const original = { id: "essay", data: {} };
  const draft = { id: "zh/essay", data: { lang: "zh", draft: true } };
  assert.deepEqual(getEntryLocales(original, [original, draft]), ["en"]);
});

test("switching language preserves filters, pagination and fragment", () => {
  const original = "/works/?type=video&page=2#collection";
  const translated = switchLocaleUrl(original, "zh");
  assert.equal(translated, "/zh/works/?type=video&page=2#collection");
  assert.equal(switchLocaleUrl(translated, "en"), original);
});

test("locale prefixes are replaced once and respect the deployment base", () => {
  assert.equal(
    switchLocaleUrl("/journal/zh/posts/example/", "en", "/journal/"),
    "/journal/posts/example/"
  );
  assert.equal(switchLocaleUrl("/journal/", "zh", "/journal/"), "/journal/zh/");
  assert.equal(switchLocaleUrl("/zh/", "zh"), "/zh/");
  assert.equal(switchLocaleUrl("/zhuang/", "zh"), "/zh/zhuang/");
  assert.equal(switchLocaleUrl("/zh/404/", "en"), "/404.html");
  assert.equal(switchLocaleUrl("/404.html", "zh"), "/zh/404/");
});

test("translated content is selected once with a deterministic original fallback", () => {
  const english = { id: "examples/essay", data: { lang: "en" } };
  const chinese = { id: "zh/examples/essay", data: { lang: "zh" } };
  const original = { id: "another-essay", data: { lang: "en" } };
  assert.deepEqual(selectLocalizedEntries([english, chinese, original], "zh"), [
    chinese,
    original,
  ]);
  assert.deepEqual(selectLocalizedEntries([chinese, english, original], "en"), [
    english,
    original,
  ]);
});

test("a draft translation cannot hide a published original", () => {
  const original = { id: "essay", data: { lang: "en" } };
  const draft = { id: "zh/essay", data: { lang: "zh", draft: true } };
  assert.deepEqual(selectLocalizedEntries([original, draft], "zh"), [original]);
  assert.deepEqual(selectLocalizedEntries([draft], "zh"), []);
});
