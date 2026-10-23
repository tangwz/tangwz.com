import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../astro-paper.config.ts";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import {
  formulaCoverageErrors,
  inspectPage,
  isPublishedArticle,
  sampleNotices,
  sourceFormulas,
} from "./site-content.mjs";

const root = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../", import.meta.url));
const publication = {
  margin: config.posts.scheduledPostMargin,
  now: Date.now(),
};
const homepage = await readFile(join(root, "dist/index.html"), "utf8");
assert.match(homepage, /<html\b[^>]*\blang="zh"/);
assert.match(homepage, /class="portfolio-home"/);
assert.ok(homepage.includes(config.site.author));
assert.ok(homepage.includes('href="/en/"'));
assert.ok(!homepage.includes("independent creative business"));

const source = join(root, "src/content/posts");
const directories = await readdir(source, { withFileTypes: true });
let count = 0;
const untranslated = [];
for (const directory of directories) {
  if (!directory.isDirectory() || !/^\d{6}-/.test(directory.name)) continue;
  const markdown = await readFile(
    join(source, directory.name, "index.md"),
    "utf8"
  );
  const { frontmatter } = parseFrontmatter(markdown);
  if (!isPublishedArticle(frontmatter, publication)) continue;
  const url = new URL(`/posts/${directory.name}/`, config.site.url).href;
  const html = await readFile(
    join(root, "dist/posts", directory.name, "index.html"),
    "utf8"
  );
  assert.match(html, /<html\b[^>]*\blang="zh"/);
  assert.ok(html.includes(`rel="canonical" href="${url}"`), url);
  assert.ok(!html.includes('content="noindex'), url);
  const duplicate = await stat(
    join(root, "dist/posts", directory.name, directory.name, "index.html")
  ).catch(() => undefined);
  assert.equal(
    duplicate,
    undefined,
    `Duplicate directory slug: ${directory.name}`
  );
  const translationPaths = [
    join(source, "en", directory.name, "index.md"),
    join(source, "en", `${directory.name}.md`),
    join(source, "en", `${directory.name}.mdx`),
  ];
  const translated = await Promise.all(
    translationPaths.map(path => stat(path).catch(() => undefined))
  );
  if (translated.every(file => !file?.isFile()))
    untranslated.push(directory.name);
  for (const match of markdown.matchAll(
    /!\[[^\]]*\]\(\.\/assets\/([^\s)]+)[^)]*\)/g
  ))
    assert.ok(
      (await stat(join(source, directory.name, "assets", match[1]))).isFile(),
      match[1]
    );
  count++;
}

const feed = await readFile(join(root, "dist/rss.xml"), "utf8");
assert.match(feed, /<language>zh-CN<\/language>/);
assert.ok([...feed.matchAll(/<item>/g)].length >= count);
const englishFeed = await readFile(join(root, "dist/en/rss.xml"), "utf8");
for (const slug of untranslated)
  assert.ok(
    !englishFeed.includes(`/en/posts/${slug}/`),
    `Do not publish untranslated articles in the English RSS feed: ${slug}`
  );
const about = await readFile(join(root, "dist/about/index.html"), "utf8");
const aboutMarkdown = await readFile(
  join(root, "src/content/pages/about.md"),
  "utf8"
);
const aboutTitle = aboutMarkdown.match(/^title:\s*"([^"]+)"/m)?.[1];
assert.ok(
  aboutTitle && about.includes(aboutTitle),
  "Render the configured About page title."
);
assert.match(about, /<article\b[^>]*>[\s\S]+<\/article>/);
async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesIn(path) : [path];
      })
    )
  ).flat();
}

const translations = JSON.parse(
  await readFile(join(root, "src/i18n/messages/zh.json"), "utf8")
);
const notices = sampleNotices
  .flatMap(value => [value, translations[value]])
  .filter(Boolean);
const rendered = new Map();
const articleKey = (title, language) => JSON.stringify([title, language]);
for (const path of await filesIn(join(root, "dist"))) {
  if (!path.endsWith(".html")) continue;
  const page = inspectPage(await readFile(path, "utf8"), notices);
  assert.deepEqual(page.errors, [], path);
  if (page.article && page.language === page.article.language) {
    const key = articleKey(page.article.title, page.article.language);
    rendered.set(key, [...(rendered.get(key) ?? []), ...page.formulas]);
  }
}

const expected = new Map();
for (const path of await filesIn(source)) {
  if (!/\.(md|mdx)$/.test(path) || /[/\\]_[^/\\]*$/.test(path)) continue;
  const markdown = await readFile(path, "utf8");
  const { frontmatter } = parseFrontmatter(markdown);
  if (!isPublishedArticle(frontmatter, publication)) continue;
  assert.ok(!frontmatter.sample, `Published theme sample: ${path}`);
  const key = articleKey(frontmatter.title, frontmatter.lang ?? "zh");
  expected.set(key, [
    ...(expected.get(key) ?? []),
    ...(await sourceFormulas(markdown, path)),
  ]);
}
let formulas = 0;
for (const [key, values] of expected) {
  assert.ok(rendered.has(key), `Missing original article: ${key}`);
  assert.deepEqual(formulaCoverageErrors(values, rendered.get(key)), [], key);
  formulas += values.length;
}
process.stdout.write(
  `Blog migration validated: ${count} legacy articles, ${formulas} formulas, no theme samples, Chinese root, About and RSS.\n`
);
