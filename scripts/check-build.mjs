import assert from "node:assert/strict";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { fromHtml } from "hast-util-from-html";
import config from "../astro-paper.config.ts";
import { resolveGoogleAnalyticsId } from "../src/utils/googleAnalytics.ts";
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
const analyticsId = resolveGoogleAnalyticsId(config.site.googleAnalyticsId);
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
let analyticsInitializerText;

function checkAnalytics(html, path) {
  // Standalone theme demos do not use the site's shared layout.
  if (path.startsWith("/design/")) return;
  const scripts = [];
  let privacyText = "";
  let hasGooglePolicy = false;
  const text = node =>
    node.type === "text"
      ? node.value
      : (node.children ?? []).map(text).join(" ");
  const inspect = node => {
    if (node.type === "element") {
      if (node.tagName === "script")
        scripts.push({ ...node.properties, text: text(node) });
      if (node.tagName === "main") privacyText = text(node);
      if (
        node.tagName === "a" &&
        node.properties.href ===
          "https://policies.google.com/technologies/partner-sites"
      )
        hasGooglePolicy = true;
    }
    (node.children ?? []).forEach(inspect);
  };
  inspect(fromHtml(html));
  const analytics = scripts.filter(
    script =>
      String(script.dataAstroTransitionPersist ?? "").startsWith(
        "google-analytics-"
      ) ||
      /googletagmanager\.com\/gtag\/js/.test(script.src ?? "") ||
      /\bgtag\s*\(/.test(script.text)
  );
  const loaders = analytics.filter(script => script.src);
  const initializers = analytics.filter(script => !script.src);
  if (!analyticsId) {
    if (analytics.length)
      errors.push(`Disabled analytics is still loaded: ${path}`);
  } else if (loaders.length !== 1 || initializers.length !== 1) {
    errors.push(`Expected one analytics loader and initializer: ${path}`);
  } else {
    const [loader] = loaders;
    const [initializer] = initializers;
    if (analyticsInitializerText === undefined)
      analyticsInitializerText = initializer.text;
    else if (analyticsInitializerText !== initializer.text)
      errors.push(`Analytics initializer varies between pages: ${path}`);
    if (
      loader.src !==
        `https://www.googletagmanager.com/gtag/js?id=${analyticsId}` ||
      loader.async !== true ||
      loader.dataAstroTransitionPersist !== "google-analytics-loader"
    )
      errors.push(`Incorrect analytics loader or persistence: ${path}`);
    try {
      const context = {};
      context.window = context;
      runInNewContext(initializer.text, context, { timeout: 100 });
      assert.equal(typeof context.gtag, "function");
      const calls = Array.from(context.dataLayer ?? [], args =>
        Array.from(args)
      );
      assert.equal(calls.length, 2);
      assert.equal(calls[0][0], "js");
      assert.equal(
        Object.prototype.toString.call(calls[0][1]),
        "[object Date]"
      );
      assert.deepEqual(calls[1], ["config", analyticsId]);
    } catch {
      errors.push(`Incorrect analytics initialization: ${path}`);
    }
  }
  if (/(?:^|\/)privacy\/$/.test(path)) {
    const disclosed =
      privacyText.includes("Google Analytics") &&
      /\bcookies?\b/i.test(privacyText);
    if (
      disclosed !== Boolean(analyticsId) ||
      hasGooglePolicy !== Boolean(analyticsId)
    )
      errors.push(
        `Analytics privacy disclosure does not match configuration: ${path}`
      );
  }
}

for (const [path, html] of htmlByPath) {
  checkAnalytics(html, path);
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
