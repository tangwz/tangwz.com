import { load } from "cheerio";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyReferencedAsset } from "./lib/assets.mjs";
import { extractArticleHtml, htmlToMarkdown } from "./lib/content.mjs";
import { extractMetadata, toFrontmatter } from "./lib/metadata.mjs";

const CANONICAL_POST_DIR_PATTERN = /^20\d{4}-/;
const SHORT_BODY_TEXT_LENGTH = 40;

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function blocker(message) {
  return message;
}

function isLocalAssetUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return false;

  try {
    return new URL(url).hostname === "tangwz.com";
  } catch {
    return url.startsWith("/") || !/^[a-z][a-z0-9+.-]*:/i.test(url);
  }
}

function permalinkFromCanonical($, postDirName) {
  const canonical = cleanText($('link[rel="canonical"]').first().attr("href"));
  if (canonical) {
    try {
      const url = new URL(canonical);
      return normalizePermalink(url.pathname);
    } catch {
      return normalizePermalink(canonical);
    }
  }

  return `/posts/${postDirName}/`;
}

function normalizePermalink(value) {
  const path = String(value ?? "").split(/[?#]/, 1)[0].trim();
  if (!path) return "";
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function slugFromPermalink(permalink, fallbackDirName) {
  const normalized = normalizePermalink(permalink);
  const match = normalized.match(/\/posts\/([^/]+)\/$/);
  if (match) return match[1];

  return fallbackDirName.replace(/^20\d{4}-/, "");
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readIndexRecords(sourceRoot) {
  const indexPath = join(sourceRoot, "index.json");
  if (!(await exists(indexPath))) return { records: new Map(), blockers: [] };

  let parsed;
  try {
    const raw = await readFile(indexPath, "utf8");
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      records: new Map(),
      blockers: [blocker(`Malformed index.json: ${errorMessage(error)}`)],
    };
  }

  const records = Array.isArray(parsed) ? parsed : Object.values(parsed ?? {});
  const byPermalink = new Map();

  for (const record of records) {
    const permalink = normalizePermalink(record?.permalink ?? record?.url ?? record?.path);
    if (permalink) byPermalink.set(permalink, record);
  }

  return { records: byPermalink, blockers: [] };
}

async function discoverPostDirs(sourceRoot) {
  const postsRoot = join(sourceRoot, "posts");
  if (!(await exists(postsRoot))) return [];

  const entries = await readdir(postsRoot, { withFileTypes: true });
  const postDirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!CANONICAL_POST_DIR_PATTERN.test(entry.name)) continue;

    const htmlPath = join(postsRoot, entry.name, "index.html");
    if (!(await exists(htmlPath))) continue;

    postDirs.push({ name: entry.name, path: join(postsRoot, entry.name), htmlPath });
  }

  return postDirs.sort((a, b) => a.name.localeCompare(b.name));
}

function collectImageSources($) {
  return $("img[src]")
    .toArray()
    .map(image => $(image).attr("src"))
    .filter(Boolean);
}

function replaceImageSource($, source, target) {
  $("img[src]").each((_, image) => {
    if ($(image).attr("src") === source) {
      $(image).attr("src", target);
    }
  });
}

function markdownTextLength(markdown) {
  return cleanText(
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/[#>*_`[\]()]/g, " ")
  ).length;
}

function residualHtml(markdown) {
  const withoutFencedCode = String(markdown ?? "").replace(/```[\s\S]*?```/g, " ");
  return /<\/?[a-z][\w:-]*(?:\s[^>]*)?>/i.test(withoutFencedCode);
}

function unmigratedLocalImageUrls(markdown) {
  const urls = [];
  const imagePattern = /!\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(imagePattern)) {
    const url = match[1].split(/\s+/, 1)[0];
    if (isLocalAssetUrl(url) && !url.startsWith("./assets/")) {
      urls.push(url);
    }
  }
  return urls;
}

function codeBlockCount(markdown) {
  return markdown.match(/^```/gm)?.length / 2 || 0;
}

function fillMissingRequiredMetadata(metadata) {
  return {
    ...metadata,
    title: cleanText(metadata.title) || "TBD",
    pubDatetime: cleanText(metadata.pubDatetime) || "1970-01-01T00:00:00+00:00",
    description: cleanText(metadata.description) || "TBD",
  };
}

function postReportBase({ sourceDirName, slug, permalink }) {
  return {
    sourceDirName,
    slug,
    permalink,
    generated: false,
    copiedAssets: [],
    missingAssets: [],
    fallbacks: [],
    residualHtml: false,
    textLength: 0,
    imageCount: 0,
    codeBlockCount: 0,
    blockers: [],
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fallbackPostReport(postDir, error) {
  const slug = postDir.name.replace(/^20\d{4}-/, "");
  return {
    ...postReportBase({
      sourceDirName: postDir.name,
      slug,
      permalink: `/posts/${slug}/`,
    }),
    blockers: [blocker(`Post migration failed: ${errorMessage(error)}`)],
  };
}

async function failedPostReport({ postDir, error }) {
  try {
    const html = await readFile(postDir.htmlPath, "utf8");
    const $ = load(html);
    const permalink = permalinkFromCanonical($, postDir.name);
    const slug = slugFromPermalink(permalink, postDir.name);
    return {
      ...postReportBase({ sourceDirName: postDir.name, slug, permalink }),
      blockers: [blocker(`Post migration failed: ${errorMessage(error)}`)],
    };
  } catch {
    return fallbackPostReport(postDir, error);
  }
}

async function copyAssetForPost({
  sourceRoot,
  outputPostDir,
  postSlug,
  imageUrl,
  usedNames,
  copiedBySource,
  postReport,
}) {
  const result = await copyReferencedAsset({
    sourceRoot,
    outputPostDir,
    postSlug,
    imageUrl,
    usedNames,
    copiedBySource,
  });

  if (result.markdownPath) {
    if (!result.reused) {
      postReport.copiedAssets.push({
        source: imageUrl,
        markdownPath: result.markdownPath,
        copiedFrom: result.copiedFrom,
        copiedTo: result.copiedTo,
      });
    }
    return result.markdownPath;
  }

  if (result.missing && isLocalAssetUrl(result.missing)) {
    postReport.missingAssets.push(result.missing);
    postReport.blockers.push(blocker(`Missing local asset: ${result.missing}`));
  }

  return "";
}

async function migratePost({ sourceRoot, outRoot, indexRecords, postDir }) {
  const html = await readFile(postDir.htmlPath, "utf8");
  const $ = load(html);
  const permalink = permalinkFromCanonical($, postDir.name);
  const slug = slugFromPermalink(permalink, postDir.name);
  const outputPostDir = join(outRoot, slug);
  const postReport = postReportBase({ sourceDirName: postDir.name, slug, permalink });

  await rm(outputPostDir, { recursive: true, force: true });
  await mkdir(outputPostDir, { recursive: true });

  const usedNames = new Set();
  const copiedBySource = new Map();
  const metadata = extractMetadata($, indexRecords, permalink);
  postReport.fallbacks = metadata.fallbacks;

  if (metadata.ogImage && isLocalAssetUrl(metadata.ogImage)) {
    const copiedOgImage = await copyAssetForPost({
      sourceRoot,
      outputPostDir,
      postSlug: postDir.name,
      imageUrl: metadata.ogImage,
      usedNames,
      copiedBySource,
      postReport,
    });
    if (copiedOgImage) metadata.ogImage = copiedOgImage;
  }

  const requiredMissing = ["title", "pubDatetime", "description"].filter(
    field => !cleanText(metadata[field])
  );
  for (const field of requiredMissing) {
    postReport.blockers.push(blocker(`Missing required metadata: ${field}`));
  }

  const articleHtml = extractArticleHtml($);
  const body = load(`<main>${articleHtml}</main>`, null, false);
  const imageSources = collectImageSources(body);
  postReport.imageCount = imageSources.length;

  for (const imageUrl of imageSources) {
    if (!isLocalAssetUrl(imageUrl)) continue;

    const markdownPath = await copyAssetForPost({
      sourceRoot,
      outputPostDir,
      postSlug: postDir.name,
      imageUrl,
      usedNames,
      copiedBySource,
      postReport,
    });

    if (markdownPath) replaceImageSource(body, imageUrl, markdownPath);
  }

  const markdown = htmlToMarkdown(body("main").html() ?? "");
  const textLength = markdownTextLength(markdown);
  postReport.textLength = textLength;
  postReport.codeBlockCount = codeBlockCount(markdown);
  postReport.residualHtml = residualHtml(markdown);

  if (textLength < SHORT_BODY_TEXT_LENGTH) {
    postReport.blockers.push(blocker(`Short body text: ${textLength} characters`));
  }

  if (postReport.residualHtml) {
    postReport.blockers.push(blocker("Residual HTML remains in Markdown body"));
  }

  for (const url of unmigratedLocalImageUrls(markdown)) {
    postReport.blockers.push(blocker(`Unmigrated local image URL: ${url}`));
  }

  const frontmatterMetadata =
    requiredMissing.length > 0 ? fillMissingRequiredMetadata(metadata) : metadata;
  const content = `${toFrontmatter(frontmatterMetadata)}${markdown}\n`;
  await writeFile(join(outputPostDir, "index.md"), content);
  postReport.generated = true;

  return postReport;
}

async function cleanStaleOldOutputDirs(outRoot) {
  if (!(await exists(outRoot))) return [];

  const entries = await readdir(outRoot, { withFileTypes: true });
  const cleanedOutputDirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!CANONICAL_POST_DIR_PATTERN.test(entry.name)) continue;

    const outputDir = join(outRoot, entry.name);
    await rm(outputDir, { recursive: true, force: true });
    cleanedOutputDirs.push(outputDir);
  }

  return cleanedOutputDirs.sort();
}

export async function runMigration({ sourceRoot, outRoot, reportPath, expectedCount = 25 }) {
  if (!sourceRoot) throw new Error("sourceRoot is required");
  if (!outRoot) throw new Error("outRoot is required");
  if (!reportPath) throw new Error("reportPath is required");

  const report = {
    generatedAt: new Date().toISOString(),
    sourceRoot,
    outRoot,
    expectedCount,
    migratedCount: 0,
    cleanedOutputDirs: [],
    blockers: [],
    posts: [],
  };

  const postsRoot = join(sourceRoot, "posts");
  if (!(await exists(postsRoot))) {
    report.blockers.push(blocker(`Missing source posts directory: ${postsRoot}`));
  }

  const indexResult = await readIndexRecords(sourceRoot);
  report.blockers.push(...indexResult.blockers);
  const postDirs = await discoverPostDirs(sourceRoot);

  if (postDirs.length !== expectedCount) {
    report.blockers.push(
      blocker(`Expected ${expectedCount} canonical posts but discovered ${postDirs.length}`)
    );
  }

  report.cleanedOutputDirs = await cleanStaleOldOutputDirs(outRoot);
  await mkdir(outRoot, { recursive: true });

  for (const postDir of postDirs) {
    try {
      const postReport = await migratePost({
        sourceRoot,
        outRoot,
        indexRecords: indexResult.records,
        postDir,
      });
      report.posts.push(postReport);
    } catch (error) {
      report.posts.push(await failedPostReport({ postDir, error }));
    }
  }

  report.migratedCount = report.posts.filter(post => post.generated).length;
  for (const post of report.posts) {
    for (const postBlocker of post.blockers) {
      report.blockers.push(`${post.slug}: ${postBlocker}`);
    }
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  return report;
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const name = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }

    args[name] = value;
    index += 1;
  }

  return {
    sourceRoot: args.source,
    outRoot: args.out,
    reportPath: args.report,
    expectedCount: args["expected-count"] ? Number.parseInt(args["expected-count"], 10) : 25,
  };
}

function validateCliOptions(options) {
  const missing = [];
  if (!options.sourceRoot) missing.push("--source");
  if (!options.outRoot) missing.push("--out");
  if (!options.reportPath) missing.push("--report");
  if (!Number.isInteger(options.expectedCount) || options.expectedCount < 0) {
    missing.push("--expected-count");
  }

  if (missing.length > 0) {
    throw new Error(`Invalid or missing CLI options: ${missing.join(", ")}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateCliOptions(options);
  const report = await runMigration(options);
  const blockerCount = report.blockers.length;

  console.log(`Migrated ${report.migratedCount} posts with ${blockerCount} blockers.`);

  if (blockerCount > 0) {
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && currentFile === process.argv[1]) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
