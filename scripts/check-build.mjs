import assert from "node:assert/strict";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import config from "../astro-paper.config.ts";
import { getMathErrors } from "../src/utils/mathValidation.ts";
import { getOutputPath } from "../src/utils/buildPaths.ts";

const root = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]) + sep)
  : new URL("../dist/", import.meta.url);
const info = JSON.parse(
  await readFile(new URL("build-info.json", root), "utf8")
);
const site = new URL(info.site);
const base = info.base ?? "/";
const baseRoot = base.replace(/\/+$/, "") + "/";
const errors = [];
const decode = value => value.replace(/&amp;/g, "&");
const exists = async url =>
  stat(url).then(
    value => value.isFile(),
    () => false
  );

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(entry => {
      const url = new URL(entry.name, dir);
      return entry.isDirectory() ? walk(new URL(`${entry.name}/`, dir)) : [url];
    })
  );
  return nested.flat();
}

const htmlFiles = (await walk(root)).filter(url =>
  url.pathname.endsWith(".html")
);
const htmlByPath = new Map();
const pathFor = file => {
  const relative = fileURLToPath(file).slice(fileURLToPath(root).length);
  return `/${relative.replace(/index\.html$/, "")}`;
};
for (const file of htmlFiles)
  htmlByPath.set(pathFor(file), await readFile(file, "utf8"));
const noindex = html =>
  /<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html);

for (const [path, html] of htmlByPath) {
  errors.push(...getMathErrors(html).map(message => `${message}: ${path}`));
  const canonical = html.match(
    /<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/
  )?.[1];
  if (!canonical) errors.push(`Missing canonical: ${path}`);
  if (noindex(html)) continue;
  const language = path.startsWith("/en/") ? "en" : "zh";
  if (html.includes('class="newsletter-unavailable"')) {
    if (!html.includes('class="newsletter-closed-label"'))
      errors.push(`Missing closed-subscription label: ${path}`);
    if (html.includes('name="email"'))
      errors.push(`Closed newsletter still collects email: ${path}`);
  }
  if (!html.includes(`lang="${language}"`))
    errors.push(`Incorrect page language: ${path}`);
  if (!/<meta\b[^>]*name="description"[^>]*content="[^"]+"/.test(html))
    errors.push(`Missing description: ${path}`);
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const value = decode(match[1]);
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue;
    const pageURL = new URL(base.replace(/\/+$/, "") + path, site);
    const url = new URL(value, pageURL);
    const outputPath = getOutputPath(url.pathname, base);
    if (outputPath === undefined) {
      errors.push(
        "Local URL outside the deployment base on " + path + ": " + value
      );
      continue;
    }
    const target = outputPath.slice(1);
    const direct = new URL(target, root);
    const index = new URL(
      `${target.replace(/\/+$/, "")}/index.html`.replace(/^\//, ""),
      root
    );
    if (!(await exists(direct)) && !(await exists(index)))
      errors.push(`Broken local URL on ${path}: ${value}`);
  }
  const social = html.match(
    /<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/
  )?.[1];
  if (social) {
    const image = new URL(decode(social));
    const imagePath = getOutputPath(image.pathname, base);
    if (
      image.origin === site.origin &&
      (imagePath === undefined ||
        !(await exists(new URL(imagePath.slice(1), root))))
    )
      errors.push(`Missing social image: ${path}`);
  }
}

const sitemap = await readFile(new URL("sitemap-0.xml", root), "utf8");
const robots = await readFile(new URL("robots.txt", root), "utf8");
const advertisedSitemaps = [...robots.matchAll(/^Sitemap:\s*(\S+)/gim)].map(
  match => match[1]
);
const expectedSitemap = new URL(baseRoot + "sitemap-index.xml", site).href;
if (
  advertisedSitemaps.length !== 1 ||
  advertisedSitemaps[0] !== expectedSitemap ||
  !(await exists(new URL("sitemap-index.xml", root)))
)
  errors.push(
    "robots.txt must advertise the deployed sitemap index: " + expectedSitemap
  );
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
  match => new URL(decode(match[1]))
);
for (const url of urls) {
  const html = htmlByPath.get(getOutputPath(url.pathname, base));
  if (!html || noindex(html))
    errors.push(`Non-indexable sitemap URL: ${url.pathname}`);
  if (url.origin !== site.origin)
    errors.push(`Wrong sitemap origin: ${url.href}`);
}
for (const [path, html] of htmlByPath) {
  if (
    !noindex(html) &&
    !urls.some(url => getOutputPath(url.pathname, base) === path)
  )
    errors.push(`Missing sitemap URL: ${path}`);
}
for (const prefix of ["", "en/"]) {
  for (const page of [
    "",
    "works/",
    "newsletter/",
    "privacy/",
    ...(config.features?.search === false ? [] : ["search/"]),
  ]) {
    assert.ok(
      htmlByPath.has(`/${prefix}${page}`),
      `Missing bilingual route: /${prefix}${page}`
    );
  }
  for (const [page, enabled] of [
    ["search/", config.features?.search !== false],
    ["archives/", config.features?.showArchives !== false],
  ]) {
    const html = htmlByPath.get(`/${prefix}${page}`);
    if (
      !enabled &&
      html &&
      (!noindex(html) || !/<h1\b[^>]*>\s*404\s*<\/h1>/.test(html))
    )
      errors.push(`Disabled feature is still exposed: /${prefix}${page}`);
  }
  const rss = await readFile(new URL(`${prefix}rss.xml`, root), "utf8");
  const channelLink = rss.match(/<channel>[\s\S]*?<link>(.*?)<\/link>/)?.[1];
  const expectedHome = new URL(baseRoot + prefix, site).href;
  if (!channelLink || decode(channelLink) !== expectedHome)
    errors.push(`Incorrect RSS channel homepage: ${prefix}rss.xml`);
  for (const match of rss.matchAll(/<link>(.*?)<\/link>/g)) {
    const link = new URL(decode(match[1]));
    const outputPath = getOutputPath(link.pathname, base);
    if (link.origin !== site.origin)
      errors.push(`Wrong RSS origin: ${prefix}rss.xml`);
    if (outputPath === undefined || !htmlByPath.has(outputPath))
      errors.push(`Broken RSS local URL: ${prefix}rss.xml: ${link.href}`);
  }
  const feedLocale = prefix ? "en" : "zh";
  for (const match of rss.matchAll(
    /<item\b[^>]*>[\s\S]*?<link>(.*?)<\/link>/g
  )) {
    const link = new URL(decode(match[1]));
    const html = htmlByPath.get(getOutputPath(link.pathname, base));
    const language = html?.match(/<html\b[^>]*\blang="([^"]+)"/)?.[1];
    if (html && (noindex(html) || language !== feedLocale))
      errors.push(
        `RSS item must use an indexable ${feedLocale} article: ${prefix}rss.xml: ${link.href}`
      );
  }
}
assert.ok(
  await exists(new URL("404.html", root)),
  "Missing static host fallback: 404.html"
);
if (config.features?.search !== false)
  assert.ok(
    await exists(new URL("pagefind/pagefind.js", root)),
    "Missing Pagefind production index"
  );
if (errors.length) throw new Error(errors.join("\n"));
info.validated = true;
await writeFile(
  new URL("build-info.json", root),
  JSON.stringify(info, null, 2) + "\n"
);

process.stdout.write(
  `Static output validated: ${htmlFiles.length} HTML pages, ${urls.length} indexable URLs.\n`
);
