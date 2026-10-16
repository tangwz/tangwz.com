import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import config from "../astro-paper.config.ts";

test("migration checks ignore unpublished articles but require published output", async t => {
  const root = await mkdtemp(join(tmpdir(), "site-check-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (path, content) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  const article = fields =>
    `---\ntitle: Fixture\npubDatetime: 2020-01-01T00:00:00Z\n${fields}---\nAn article.\n`;
  await put("src/content/posts/202001-fixture/index.md", article(""));
  await put("src/content/pages/about.md", '---\ntitle: "About"\n---\nAbout.');
  await put("src/i18n/messages/zh.json", "{}");
  await put(
    "dist/index.html",
    `<html lang="zh"><main class="portfolio-home">${config.site.author}<a href="/en/">English</a></main></html>`
  );
  await put(
    "dist/posts/202001-fixture/index.html",
    `<html lang="zh"><head><link rel="canonical" href="${new URL("/posts/202001-fixture/", config.site.url)}"><script type="application/ld+json">{"@type":"BlogPosting","headline":"Fixture","inLanguage":"zh"}</script></head><body><h1>Fixture</h1></body></html>`
  );
  await put("dist/about/index.html", "<h1>About</h1><article>About.</article>");
  await put("dist/rss.xml", "<language>zh-CN</language><item></item>");
  await put("dist/en/rss.xml", "<language>en</language>");
  const check = () =>
    spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        new URL("./check-site.mjs", import.meta.url).pathname,
        root,
      ],
      { encoding: "utf8" }
    );
  let result = check();
  assert.equal(result.status, 0, result.stderr);
  for (const [slug, fields] of [
    ["209912-scheduled", "pubDatetime: 2099-12-31T00:00:00Z\n"],
    ["202001-draft", "draft: true\n"],
    ["202001-template", "template: true\n"],
  ]) {
    const markdown = article("").replace(
      "pubDatetime: 2020-01-01T00:00:00Z\n",
      fields.startsWith("pubDatetime:")
        ? fields
        : `pubDatetime: 2020-01-01T00:00:00Z\n${fields}`
    );
    await put(`src/content/posts/${slug}/index.md`, markdown);
  }
  result = check();
  assert.equal(result.status, 0, result.stderr);
  await put("src/content/posts/202001-missing/index.md", article(""));
  result = check();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /dist\/posts\/202001-missing\/index\.html/);
});
