import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  applyThemeUpdate,
  destinationPath,
  isThemeFile,
} from "./update-theme.mjs";

async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), "theme-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, "upstream");
  const root = join(temporary, "blog");
  await mkdir(source);
  await mkdir(root);
  const git = args =>
    execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
  git(["init", "-q"]);
  git(["config", "user.name", "Theme Test"]);
  git(["config", "user.email", "theme-test@example.com"]);
  const put = async (directory, path, content) => {
    const target = join(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  const commit = () => {
    git(["add", "."]);
    git(["commit", "-qm", "Update theme"]);
    return git(["rev-parse", "HEAD"]);
  };
  const update = (previous, revision) =>
    applyThemeUpdate({ root, source, previous, revision });
  return { source, root, put, commit, update };
}

test("theme scope excludes personal content, configuration and demo routes", () => {
  for (const path of [
    "src/content/posts/essay.md",
    "src/content/videos/video.md",
    "src/content/pages/about.md",
    "src/data/creator.ts",
    "src/data/letters.ts",
    "src/pages/design/index.astro",
    "astro-paper.config.ts",
    "public/favicon.svg",
    "public/tangwz-og.png",
    ".github/workflows/ci.yml",
    "scripts/update-theme.mjs",
  ])
    assert.equal(isThemeFile(path), false, path);
  assert.equal(isThemeFile("src/styles/portfolio.css"), true);
  assert.equal(isThemeFile("public/images/creative-desk.jpg"), true);
  assert.equal(
    destinationPath("src/pages/zh/posts/index.astro"),
    "src/pages/en/posts/index.astro"
  );
});

test("updates merge independent local changes and preserve personal content", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const path = "src/components/Header.astro";
  const base = "local = old;\n\n\n\n\nremote = old;\n";
  await put(source, path, base);
  await put(source, "src/content/posts/sample.md", "Theme sample");
  await put(source, "src/data/creator.ts", "Theme identity");
  const previous = commit();
  await put(root, path, base.replace("local = old", "local = personal"));
  await put(root, "src/content/posts/essay.md", "Personal essay");
  await put(root, "src/data/creator.ts", "Personal identity");
  await put(source, path, base.replace("remote = old", "remote = updated"));
  await put(source, "src/styles/new.css", "body { color: blue; }");
  const revision = commit();
  await update(previous, revision);
  const merged = await readFile(join(root, path), "utf8");
  assert.match(merged, /local = personal/);
  assert.match(merged, /remote = updated/);
  assert.equal(
    await readFile(join(root, "src/data/creator.ts"), "utf8"),
    "Personal identity"
  );
  assert.equal(
    await readFile(join(root, "src/content/posts/essay.md"), "utf8"),
    "Personal essay"
  );
  await assert.rejects(readFile(join(root, "src/content/posts/sample.md")), {
    code: "ENOENT",
  });
  assert.deepEqual(await update(revision, revision), []);
});

test("conflicts leave every file unchanged, including otherwise clean updates", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const path = "src/components/Header.astro";
  await put(source, path, "title = old;\n");
  await put(source, "src/styles/global.css", "old");
  const previous = commit();
  await put(root, path, "title = personal;\n");
  await put(root, "src/styles/global.css", "old");
  await put(source, path, "title = incoming;\n");
  await put(source, "src/styles/global.css", "new");
  await assert.rejects(update(previous, commit()), /No files changed/);
  assert.equal(await readFile(join(root, path), "utf8"), "title = personal;\n");
  assert.equal(
    await readFile(join(root, "src/styles/global.css"), "utf8"),
    "old"
  );
});

test("package updates retain local scripts and identity while updating dependencies", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const base = {
    name: "theme",
    scripts: { build: "astro build" },
    dependencies: { astro: "7.0.3" },
  };
  await put(source, "package.json", JSON.stringify(base));
  const previous = commit();
  await put(
    root,
    "package.json",
    JSON.stringify({
      ...base,
      name: "blog",
      scripts: {
        ...base.scripts,
        "theme:update": "node scripts/update-theme.mjs",
      },
    })
  );
  await put(
    source,
    "package.json",
    JSON.stringify({ ...base, dependencies: { astro: "7.0.4" } })
  );
  await update(previous, commit());
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "blog");
  assert.equal(pkg.scripts["theme:update"], "node scripts/update-theme.mjs");
  assert.equal(pkg.dependencies.astro, "7.0.4");
});

test("upstream deletions remove clean files but conflict with local edits", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const path = "src/styles/old.css";
  await put(source, path, "old");
  await put(source, "src/styles/keep.css", "keep");
  const previous = commit();
  await put(root, path, "personal");
  await put(root, "src/styles/keep.css", "keep");
  await rm(join(source, path));
  const revision = commit();
  await assert.rejects(update(previous, revision), /Conflicting changes/);
  await put(root, path, "old");
  await update(previous, revision);
  await assert.rejects(readFile(join(root, path)), { code: "ENOENT" });
});

test("new theme paths cannot overwrite unrelated local files", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  await put(source, "src/styles/global.css", "old");
  const previous = commit();
  await put(root, "src/styles/global.css", "old");
  await put(root, "src/components/New.astro", "personal");
  await put(source, "src/components/New.astro", "incoming");
  await assert.rejects(update(previous, commit()), /Conflicting changes/);
  assert.equal(
    await readFile(join(root, "src/components/New.astro"), "utf8"),
    "personal"
  );
});

test("mapped locale routes update under en and reject symbolic link parents", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  await put(source, "src/pages/zh/index.astro", "old");
  const previous = commit();
  await put(root, "src/pages/en/index.astro", "old");
  await put(source, "src/pages/zh/index.astro", "new");
  const revision = commit();
  await update(previous, revision);
  assert.equal(
    await readFile(join(root, "src/pages/en/index.astro"), "utf8"),
    "new"
  );
  await rm(join(root, "src/pages/en"), { recursive: true });
  await symlink(source, join(root, "src/pages/en"));
  await assert.rejects(update(previous, revision), /symbolic link/);
});

test("new locale routes use Chinese at root and English under en", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  await put(source, "src/styles/global.css", "old");
  const previous = commit();
  await put(root, "src/styles/global.css", "old");
  await put(source, "src/pages/news/[slug].astro", 'getArticlePaths("en");\n');
  await put(
    source,
    "src/pages/zh/news/[slug].astro",
    'getArticlePaths(\n  "zh"\n);\n'
  );
  await update(previous, commit());
  assert.equal(
    await readFile(join(root, "src/pages/news/[slug].astro"), "utf8"),
    'getArticlePaths("zh");\n'
  );
  assert.equal(
    await readFile(join(root, "src/pages/en/news/[slug].astro"), "utf8"),
    'getArticlePaths(\n  "en"\n);\n'
  );
});

test("binary assets update cleanly and reject divergent local edits", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const path = "public/images/portrait.jpg";
  const base = Buffer.from([0, 1, 2]);
  const incoming = Buffer.from([0, 3, 4]);
  await put(source, path, base);
  const previous = commit();
  await put(source, path, incoming);
  const revision = commit();
  await put(root, path, Buffer.from([0, 5, 6]));
  await assert.rejects(update(previous, revision), /Conflicting changes/);
  await put(root, path, base);
  await update(previous, revision);
  assert.deepEqual(await readFile(join(root, path)), incoming);
});
