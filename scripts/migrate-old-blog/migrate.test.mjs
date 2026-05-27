import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runMigration } from "./migrate.mjs";

async function tempMigrationDir() {
  return mkdtemp(join(tmpdir(), "old-blog-migrate-"));
}

test("migrates posts with frontmatter, markdown body, assets, and report", async () => {
  const root = await tempMigrationDir();
  const sourceRoot = join(root, "source");
  const outRoot = join(root, "out");
  const reportPath = join(root, "report.json");
  const postSourceDir = join(sourceRoot, "posts", "demo");

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
          <meta property="og:image" content="/posts/demo/cover.png" />
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
              <p><img class="rounded" style="width: 100%" src="/posts/demo/diagram.png" alt="Diagram" /></p>
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
