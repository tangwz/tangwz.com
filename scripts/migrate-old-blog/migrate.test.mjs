import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runMigration } from "./migrate.mjs";

async function tempMigrationDir() {
  return mkdtemp(join(tmpdir(), "old-blog-migrate-"));
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeCanonicalPost({
  sourceRoot,
  sourceDirName,
  canonicalSlug,
  bodyHtml = "<p>This is a long enough body text for migration validation.</p>",
  extraHeadHtml = "",
}) {
  const postSourceDir = join(sourceRoot, "posts", sourceDirName);
  await mkdir(postSourceDir, { recursive: true });
  await writeFile(
    join(postSourceDir, "index.html"),
    `
      <html>
        <head>
          <title>${canonicalSlug} - Site</title>
          <meta property="og:description" content="Summary for ${canonicalSlug}" />
          <link rel="canonical" href="https://tangwz.com/posts/${canonicalSlug}/" />
          <script type="application/ld+json">
            {
              "@type": "BlogPosting",
              "headline": "${canonicalSlug}",
              "datePublished": "2020-01-02T03:04:05+00:00",
              "keywords": ["migration"]
            }
          </script>
          ${extraHeadHtml}
        </head>
        <body>
          <article>
            <div class="min-w-0 min-h-0 max-w-prose">
              ${bodyHtml}
            </div>
          </article>
        </body>
      </html>
    `
  );
  return postSourceDir;
}

test("migrates canonical posts with frontmatter, markdown body, assets, and report", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outRoot = join(root, "out");
  const reportPath = join(root, "report.json");
  const postSourceDir = join(sourceRoot, "posts", "202001-demo");

  await mkdir(postSourceDir, { recursive: true });
  await writeFile(join(postSourceDir, "cover.png"), "cover image");
  await writeFile(join(postSourceDir, "diagram.png"), "diagram image");
  await writeFile(
    join(sourceRoot, "index.json"),
    JSON.stringify([
      {
        title: "Demo Post",
        date: "2020-01-02",
        summary: "Demo summary from index",
        permalink: "/posts/demo/",
      },
    ])
  );
  await writeFile(
    join(postSourceDir, "index.html"),
    `
      <html>
        <head>
          <title>Demo Post - Site</title>
          <meta property="og:description" content="Demo summary from og" />
          <meta property="og:image" content="/posts/202001-demo/cover.png" />
          <link rel="canonical" href="https://tangwz.com/posts/demo/" />
          <script type="application/ld+json">
            {
              "@type": "BlogPosting",
              "headline": "Demo Post",
              "datePublished": "2020-01-02T03:04:05+00:00",
              "keywords": ["migration", "demo"]
            }
          </script>
        </head>
        <body>
          <article class="theme-article">
            <div class="min-w-0 min-h-0 max-w-prose prose" style="color: red">
              <h1><a class="anchor" href="#demo" aria-hidden="true">#</a>Demo Post</h1>
              <p class="lead" style="font-size: 18px">
                This is a long enough body text for migration validation.
              </p>
              <p><img class="rounded" style="width: 100%" src="/posts/202001-demo/diagram.png" alt="Diagram" /></p>
            </div>
          </article>
        </body>
      </html>
    `
  );

  const report = await runMigration({
    sourceRoot,
    outRoot,
    reportPath,
    expectedCount: 1,
  });

  const markdown = await readFile(join(outRoot, "demo", "index.md"), "utf8");
  const persistedReport = JSON.parse(await readFile(reportPath, "utf8"));

  assert.match(markdown, /^---\ntitle: "Demo Post"\n/m);
  assert.match(markdown, /<!-- migrated-from: https:\/\/tangwz\.com\/posts\/demo\/ -->/);
  assert.match(markdown, /ogImage: "\.\/assets\/cover\.png"/);
  assert.match(markdown, /This is a long enough body text for migration validation\./);
  assert.match(markdown, /!\[Diagram\]\(\.\/assets\/diagram\.png\)/);
  assert.doesNotMatch(markdown, /\b(?:class|style)=/);
  assert.doesNotMatch(markdown, /max-w-prose|prose|lead|rounded/);

  assert.equal(report.migratedCount, 1);
  assert.equal(report.blockers.length, 0);
  assert.equal(persistedReport.migratedCount, 1);
  assert.equal(persistedReport.posts.length, 1);
  assert.equal(persistedReport.posts[0].slug, "demo");
  assert.deepEqual(
    persistedReport.posts[0].copiedAssets.map(asset => asset.markdownPath).sort(),
    ["./assets/cover.png", "./assets/diagram.png"]
  );
  assert.deepEqual(persistedReport.posts[0].missingAssets, []);
  assert.deepEqual(persistedReport.posts[0].blockers, []);
});

test("ignores non-canonical post directories and reports expected count blocker", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outRoot = join(root, "out");
  const reportPath = join(root, "report.json");
  const postSourceDir = join(sourceRoot, "posts", "demo");

  await mkdir(postSourceDir, { recursive: true });
  await writeFile(
    join(postSourceDir, "index.html"),
    `
      <html>
        <head>
          <title>Demo Post - Site</title>
          <link rel="canonical" href="https://tangwz.com/posts/demo/" />
        </head>
        <body>
          <article>
            <p>This non-canonical post directory must not be migrated.</p>
          </article>
        </body>
      </html>
    `
  );

  const report = await runMigration({
    sourceRoot,
    outRoot,
    reportPath,
    expectedCount: 1,
  });
  const persistedReport = JSON.parse(await readFile(reportPath, "utf8"));

  assert.equal(report.migratedCount, 0);
  assert.deepEqual(report.posts, []);
  assert.deepEqual(persistedReport.posts, []);
  assert.deepEqual(report.blockers, ["Expected 1 canonical posts but discovered 0"]);
});

test("reports malformed index json and still writes migration report", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outRoot = join(root, "out");
  const reportPath = join(root, "report.json");

  await mkdir(sourceRoot, { recursive: true });
  await writeFile(join(sourceRoot, "index.json"), "{bad json");
  await writeCanonicalPost({
    sourceRoot,
    sourceDirName: "202001-demo",
    canonicalSlug: "demo",
  });

  const report = await runMigration({
    sourceRoot,
    outRoot,
    reportPath,
    expectedCount: 1,
  });
  const persistedReport = JSON.parse(await readFile(reportPath, "utf8"));

  assert.equal(report.migratedCount, 1);
  assert.match(report.blockers[0], /^Malformed index.json:/);
  assert.match(persistedReport.blockers[0], /^Malformed index.json:/);
  assert.equal(await pathExists(join(outRoot, "demo", "index.md")), true);
});

test("records per-post failures and continues migrating later posts", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outRoot = join(root, "out");
  const reportPath = join(root, "report.json");
  const brokenSourceDir = await writeCanonicalPost({
    sourceRoot,
    sourceDirName: "202001-broken",
    canonicalSlug: "broken",
    extraHeadHtml: '<meta property="og:image" content="/posts/202001-broken/cover.png" />',
  });
  await mkdir(join(brokenSourceDir, "cover.png"), { recursive: true });
  await writeCanonicalPost({
    sourceRoot,
    sourceDirName: "202002-ok",
    canonicalSlug: "ok",
  });

  const report = await runMigration({
    sourceRoot,
    outRoot,
    reportPath,
    expectedCount: 2,
  });
  const brokenPost = report.posts.find(post => post.slug === "broken");
  const okPost = report.posts.find(post => post.slug === "ok");

  assert.equal(report.migratedCount, 1);
  assert.ok(brokenPost);
  assert.ok(okPost);
  assert.match(brokenPost.blockers[0], /^Post migration failed:/);
  assert.equal(brokenPost.generated, false);
  assert.deepEqual(okPost.blockers, []);
  assert.equal(await pathExists(join(outRoot, "broken")), false);
  assert.equal(await pathExists(join(outRoot, "ok", "index.md")), true);
  assert.equal(await pathExists(reportPath), true);
});

test("reports invalid source root even when expected count is zero", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "missing-source");
  const outRoot = join(root, "out");
  const reportPath = join(root, "report.json");

  const report = await runMigration({
    sourceRoot,
    outRoot,
    reportPath,
    expectedCount: 0,
  });

  assert.equal(report.migratedCount, 0);
  assert.deepEqual(report.posts, []);
  assert.ok(report.blockers.includes(`Missing source posts directory: ${join(sourceRoot, "posts")}`));
});

test("preserves unmarked date-shaped output directories", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outRoot = join(root, "out");
  const reportPath = join(root, "report.json");
  const dateShapedOutputDir = join(outRoot, "202001-handwritten");
  const currentOutputDir = join(outRoot, "current-sample");

  await mkdir(dateShapedOutputDir, { recursive: true });
  await mkdir(currentOutputDir, { recursive: true });
  await writeFile(join(dateShapedOutputDir, "index.md"), "handwritten");
  await writeFile(join(currentOutputDir, "index.md"), "current");
  await writeCanonicalPost({
    sourceRoot,
    sourceDirName: "202001-demo",
    canonicalSlug: "demo",
  });

  const report = await runMigration({
    sourceRoot,
    outRoot,
    reportPath,
    expectedCount: 1,
  });

  assert.equal(await pathExists(join(dateShapedOutputDir, "index.md")), true);
  assert.equal(await pathExists(join(currentOutputDir, "index.md")), true);
  assert.deepEqual(report.cleanedOutputDirs, []);
});

test("removes marked non-date stale output directories and preserves unmarked posts", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outRoot = join(root, "out");
  const reportPath = join(root, "report.json");
  const markedStaleDir = join(outRoot, "old-post");
  const unmarkedExistingDir = join(outRoot, "existing-post");

  await mkdir(markedStaleDir, { recursive: true });
  await mkdir(unmarkedExistingDir, { recursive: true });
  await writeFile(
    join(markedStaleDir, "index.md"),
    [
      "---",
      'title: "Old Post"',
      "---",
      "<!-- migrated-from: https://tangwz.com/posts/old-post/ -->",
      "",
      "Old generated content.",
    ].join("\n")
  );
  await writeFile(
    join(unmarkedExistingDir, "index.md"),
    ["---", 'title: "Existing Post"', "---", "", "Current hand-written content."].join("\n")
  );
  await writeCanonicalPost({
    sourceRoot,
    sourceDirName: "202001-demo",
    canonicalSlug: "demo",
  });

  const report = await runMigration({
    sourceRoot,
    outRoot,
    reportPath,
    expectedCount: 1,
  });

  assert.equal(await pathExists(markedStaleDir), false);
  assert.equal(await pathExists(join(unmarkedExistingDir, "index.md")), true);
  assert.deepEqual(report.cleanedOutputDirs, [markedStaleDir]);
});

test("removes previous-report-owned output directories", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outRoot = join(root, "out");
  const reportPath = join(root, "migration-report.json");
  const previousOutputDir = join(outRoot, "old-post");

  await mkdir(previousOutputDir, { recursive: true });
  await writeFile(join(previousOutputDir, "index.md"), "previous generated content");
  await writeFile(
    reportPath,
    JSON.stringify({
      posts: [{ slug: "old-post", generated: true }],
    })
  );
  await writeCanonicalPost({
    sourceRoot,
    sourceDirName: "202001-demo",
    canonicalSlug: "demo",
  });

  const report = await runMigration({
    sourceRoot,
    outRoot,
    reportPath,
    expectedCount: 1,
  });

  assert.equal(await pathExists(previousOutputDir), false);
  assert.deepEqual(report.cleanedOutputDirs, [previousOutputDir]);
});

test("does not treat html-looking text inside fenced code as residual html", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outRoot = join(root, "out");
  const reportPath = join(root, "report.json");

  await writeCanonicalPost({
    sourceRoot,
    sourceDirName: "202001-code",
    canonicalSlug: "code",
    bodyHtml: `
      <p>This body contains a code example with literal markup text.</p>
      <pre><code class="language-html">&lt;span class="token"&gt;value&lt;/span&gt;</code></pre>
    `,
  });

  const report = await runMigration({
    sourceRoot,
    outRoot,
    reportPath,
    expectedCount: 1,
  });
  const post = report.posts[0];

  assert.equal(post.residualHtml, false);
  assert.equal(
    post.blockers.some(value => value === "Residual HTML remains in Markdown body"),
    false
  );
});
