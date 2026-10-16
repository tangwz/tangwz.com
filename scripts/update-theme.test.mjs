import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  applyThemeUpdate,
  destinationPath,
  fetchTheme,
  isThemeFile,
} from "./update-theme.mjs";

test("successful theme fetches do not retry or wait", async () => {
  const calls = [];
  const output = Buffer.from("fetched");
  const result = await fetchTheme("/source", "main", {
    run(source, args) {
      calls.push([source, args]);
      return output;
    },
    wait() {
      assert.fail("A successful fetch must not wait");
    },
  });
  assert.equal(result, output);
  assert.deepEqual(calls, [
    ["/source", ["fetch", "--depth=1", "origin", "main"]],
  ]);
});

test("theme fetches recover from transient failures with bounded backoff", async () => {
  let attempts = 0;
  const waits = [];
  await fetchTheme("/source", "a".repeat(40), {
    run() {
      if (++attempts < 3) throw new Error("Temporary TLS failure");
    },
    wait(milliseconds) {
      waits.push(milliseconds);
    },
  });
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [500, 1000]);
});

test("theme fetches stop after three failures and preserve the original error", async () => {
  let attempts = 0;
  const error = new Error("Connection unavailable");
  const waits = [];
  await assert.rejects(
    fetchTheme("/source", "main", {
      run() {
        attempts++;
        throw error;
      },
      wait(milliseconds) {
        waits.push(milliseconds);
      },
    }),
    actual => actual === error
  );
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [500, 1000]);
});

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
  const put = async (directory, path, content, mode) => {
    const target = join(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    if (mode !== undefined) await chmod(target, mode);
  };
  const commit = () => {
    git(["add", "."]);
    git(["commit", "-qm", "Update theme"]);
    return git(["rev-parse", "HEAD"]);
  };
  const update = (previous, revision, options = {}) =>
    applyThemeUpdate({ root, source, previous, revision, ...options });
  const snapshot = async (directory = root) => {
    const files = {};
    for (const path of (await readdir(directory, { recursive: true })).sort()) {
      const target = join(directory, path);
      const metadata = await stat(target);
      if (metadata.isFile()) {
        const content = await readFile(target);
        files[path] = {
          content:
            path === "package.json"
              ? JSON.parse(content.toString())
              : content.toString("base64"),
          mode: metadata.mode & 0o777,
        };
      }
    }
    return files;
  };
  return { source, root, put, commit, update, snapshot };
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
    "scripts/verify-theme.mjs",
    "scripts/verify-theme.test.mjs",
    "scripts/check-site.mjs",
    "scripts/site-content.mjs",
    "playwright.config.ts",
    "tests/layout/works.spec.ts",
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

test("successive upgrades match a direct upgrade across routes, files, dependencies and modes", async t => {
  const { source, root, put, commit, update, snapshot } = await fixture(t);
  const direct = join(dirname(root), "direct-blog");
  await mkdir(direct);
  const header = "src/components/Header.astro";
  const command = "src/scripts/command.sh";
  const style = "src/styles/new.css";
  const removed = "src/styles/old.css";
  const transient = "src/styles/transient.css";
  const rootRoute = "src/pages/journal/index.astro";
  const localizedRoute = "src/pages/zh/journal/index.astro";
  const mappedRoute = "src/pages/en/journal/index.astro";
  const content = version =>
    `local = default;\n\n\n\n\n\nremote = ${version};\n`;
  const route = (locale, version) =>
    `getWritingPaths("${locale}", options);\nconst version = "${version}";\n`;
  const pkg = version => ({
    name: "theme",
    scripts: { build: "astro build" },
    dependencies: {
      astro: `7.0.${version}`,
      ...(version > 3 ? { "theme-addon": `${version - 3}.0.0` } : {}),
    },
  });
  await put(source, header, content("a"));
  await put(source, command, "#!/bin/sh\nexit 0\n", 0o644);
  await put(source, removed, "old style\n");
  await put(source, "package.json", JSON.stringify(pkg(3)));
  const a = commit();
  for (const directory of [root, direct]) {
    await put(
      directory,
      header,
      content("a").replace("local = default", "local = personal")
    );
    await put(directory, command, "#!/bin/sh\nexit 0\n", 0o644);
    await put(directory, removed, "old style\n");
    await put(
      directory,
      "package.json",
      JSON.stringify({
        ...pkg(3),
        name: "blog",
        scripts: { ...pkg(3).scripts, "theme:update": "node update-theme.mjs" },
        dependencies: { ...pkg(3).dependencies, "blog-only": "1.0.0" },
      })
    );
  }

  await put(source, header, content("b"));
  await chmod(join(source, command), 0o755);
  await rm(join(source, removed));
  await put(source, style, "style from b\n");
  await put(source, transient, "only in b\n");
  await put(source, rootRoute, route("en", "b"));
  await put(source, localizedRoute, route("zh", "b"));
  await put(source, "package.json", JSON.stringify(pkg(4)));
  const b = commit();
  await update(a, b);
  const afterB = await snapshot();
  assert.deepEqual(await update(b, b), []);
  assert.deepEqual(await snapshot(), afterB);

  await put(source, header, content("c"));
  await put(source, command, "#!/bin/sh\nexit 1\n", 0o755);
  await put(source, style, "style from c\n");
  await rm(join(source, transient));
  await put(source, rootRoute, route("en", "c"));
  await put(source, localizedRoute, route("zh", "c"));
  await put(source, "package.json", JSON.stringify(pkg(5)));
  const c = commit();
  await update(b, c);
  await update(a, c, { root: direct });
  assert.deepEqual(await snapshot(), await snapshot(direct));
  assert.equal(
    await readFile(join(root, header), "utf8"),
    content("c").replace("local = default", "local = personal")
  );
  assert.equal(await readFile(join(root, style), "utf8"), "style from c\n");
  assert.equal(await readFile(join(root, rootRoute), "utf8"), route("zh", "c"));
  assert.equal(
    await readFile(join(root, mappedRoute), "utf8"),
    route("en", "c")
  );
  for (const path of [removed, transient, localizedRoute])
    await assert.rejects(readFile(join(root, path)), { code: "ENOENT" });
  assert.equal((await stat(join(root, command))).mode & 0o777, 0o755);
  assert.deepEqual(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")),
    {
      ...pkg(5),
      name: "blog",
      scripts: { ...pkg(5).scripts, "theme:update": "node update-theme.mjs" },
      dependencies: { ...pkg(5).dependencies, "blog-only": "1.0.0" },
    }
  );
  assert.deepEqual(await update(c, c), []);
});

test("later upgrades retain blog adaptations added after an earlier upgrade", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const path = "src/scripts/command.sh";
  const content = version =>
    `initial = default;\n\n\n\n\n\nlater = default;\n\n\n\n\n\nremote = ${version};\n`;
  const pkg = version => ({
    name: "theme",
    dependencies: { astro: `7.0.${version}` },
    scripts: { build: "astro build" },
  });
  await put(source, path, content("a"), 0o644);
  await put(source, "package.json", JSON.stringify(pkg(3)));
  const a = commit();
  await put(
    root,
    path,
    content("a").replace("initial = default", "initial = personal"),
    0o644
  );
  await put(
    root,
    "package.json",
    JSON.stringify({
      ...pkg(3),
      name: "blog",
      dependencies: { ...pkg(3).dependencies, "blog-only": "1.0.0" },
    })
  );
  await put(source, path, content("b"));
  await put(source, "package.json", JSON.stringify(pkg(4)));
  const b = commit();
  await update(a, b);

  await put(
    root,
    path,
    (await readFile(join(root, path), "utf8")).replace(
      "later = default",
      "later = personal"
    ),
    0o755
  );
  const local = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  local.dependencies["blog-only"] = "2.0.0";
  local.scripts["theme:update"] = "node update-theme.mjs";
  await put(root, "package.json", JSON.stringify(local));

  await put(source, path, content("c"));
  await put(source, "package.json", JSON.stringify(pkg(5)));
  const c = commit();
  await update(b, c);
  assert.equal(
    await readFile(join(root, path), "utf8"),
    content("c")
      .replace("initial = default", "initial = personal")
      .replace("later = default", "later = personal")
  );
  assert.equal((await stat(join(root, path))).mode & 0o777, 0o755);
  assert.deepEqual(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")),
    {
      ...pkg(5),
      name: "blog",
      dependencies: { ...pkg(5).dependencies, "blog-only": "2.0.0" },
      scripts: { ...pkg(5).scripts, "theme:update": "node update-theme.mjs" },
    }
  );
  assert.deepEqual(await update(c, c), []);
});

test("reviewed package resolutions unblock updates while other files still merge", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const pkg = build => JSON.stringify({ scripts: { build } });
  const style = "src/styles/global.css";
  await put(source, "package.json", pkg("astro build"));
  await put(source, style, "old");
  const previous = commit();
  await put(root, "package.json", pkg("astro build && check-site"));
  await put(root, style, "old");
  await put(source, "package.json", pkg("astro check && astro build"));
  await put(source, style, "new");
  const revision = commit();
  await assert.rejects(
    update(previous, revision),
    /package.json.scripts.build/
  );

  const resolved = pkg("astro check && astro build && check-site");
  await put(root, "package.json", resolved);
  assert.deepEqual(
    await update(previous, revision, {
      resolvedFiles: ["package.json"],
      resolvedRevision: revision,
    }),
    [style]
  );
  assert.equal(await readFile(join(root, "package.json"), "utf8"), resolved);
  assert.equal(await readFile(join(root, style), "utf8"), "new");
  assert.deepEqual(await update(revision, revision), []);
});

test("an unresolved conflict prevents writes even when another file is resolved", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const resolved = "src/components/Header.astro";
  const unresolved = "src/components/Footer.astro";
  const style = "src/styles/global.css";
  for (const path of [resolved, unresolved, style])
    await put(source, path, "old\n");
  const previous = commit();
  for (const path of [resolved, unresolved])
    await put(root, path, "personal\n");
  await put(root, style, "old\n");
  for (const path of [resolved, unresolved, style])
    await put(source, path, "incoming\n");
  const revision = commit();
  await put(root, resolved, "personal and incoming\n");
  await assert.rejects(
    update(previous, revision, {
      resolvedFiles: [resolved],
      resolvedRevision: revision,
    }),
    /Conflicting changes: src\/components\/Footer.astro[\s\S]*No files changed/
  );
  assert.equal(
    await readFile(join(root, resolved), "utf8"),
    "personal and incoming\n"
  );
  assert.equal(await readFile(join(root, unresolved), "utf8"), "personal\n");
  assert.equal(await readFile(join(root, style), "utf8"), "old\n");
});

test("invalid, duplicate and non-conflicting resolution paths reject the entire update", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const style = "src/styles/global.css";
  await put(source, style, "old");
  const previous = commit();
  await put(root, style, "old");
  await put(source, style, "new");
  const revision = commit();
  for (const [paths, message] of [
    [["../outside.ts"], /Invalid resolved file path/],
    [["/src/styles/global.css"], /Invalid resolved file path/],
    [["src\\styles\\global.css"], /Invalid resolved file path/],
    [["src/./styles/global.css"], /Invalid resolved file path/],
    [[style, style], /Duplicate resolved file/],
    [[style], /Resolved file did not conflict/],
    [["package.json"], /Resolved file did not conflict/],
    [["src/content/posts/private.md"], /Resolved file did not conflict/],
  ]) {
    await assert.rejects(
      update(previous, revision, {
        resolvedFiles: paths,
        resolvedRevision: revision,
      }),
      message
    );
    assert.equal(await readFile(join(root, style), "utf8"), "old");
  }
});

test("resolutions must be reviewed again when the target revision changes", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const path = "src/components/Header.astro";
  await put(source, path, "old\n");
  const previous = commit();
  await put(root, path, "personal and first incoming\n");
  await put(source, path, "first incoming\n");
  const reviewed = commit();
  await put(source, path, "second incoming\n");
  const revision = commit();
  for (const resolvedRevision of [undefined, "main", reviewed])
    await assert.rejects(
      update(previous, revision, {
        resolvedFiles: [path],
        resolvedRevision,
      }),
      /exact reviewed theme revision/
    );
  assert.equal(
    await readFile(join(root, path), "utf8"),
    "personal and first incoming\n"
  );
});

test("CLI resolutions require an explicit full SHA and cannot run in check mode", () => {
  for (const args of [
    [],
    ["--ref", "main"],
    ["--ref", "a".repeat(40), "--check"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, "update-theme.mjs"),
        "--resolved-file",
        "package.json",
        ...args,
      ],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /--resolved-file requires --ref with a full commit SHA/
    );
  }
});

test("resolution flags cannot bypass malformed package JSON", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  await put(source, "package.json", '{"name":"theme"}');
  const previous = commit();
  await put(root, "package.json", "invalid JSON");
  await put(source, "package.json", '{"name":"new-theme"}');
  const revision = commit();
  await assert.rejects(
    update(previous, revision, {
      resolvedFiles: ["package.json"],
      resolvedRevision: revision,
    }),
    /Resolved file did not conflict[\s\S]*No files changed/
  );
  assert.equal(
    await readFile(join(root, "package.json"), "utf8"),
    "invalid JSON"
  );
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

test("mode-only updates synchronize both executable-bit directions", async t => {
  for (const [beforeMode, afterMode] of [
    [0o644, 0o755],
    [0o755, 0o644],
  ]) {
    await t.test(
      `${beforeMode.toString(8)} to ${afterMode.toString(8)}`,
      async t => {
        const { source, root, put, commit, update } = await fixture(t);
        const path = "src/scripts/command.sh";
        const content = "#!/bin/sh\nexit 0\n";
        await put(source, path, content, beforeMode);
        const previous = commit();
        await put(root, path, content, beforeMode);
        await chmod(join(source, path), afterMode);
        const revision = commit();
        assert.deepEqual(await update(previous, revision), [path]);
        assert.equal((await stat(join(root, path))).mode & 0o777, afterMode);
        assert.equal(await readFile(join(root, path), "utf8"), content);
        assert.deepEqual(await update(revision, revision), []);
      }
    );
  }
});

test("content updates preserve independent local executable-bit changes", async t => {
  for (const [beforeMode, localMode] of [
    [0o644, 0o755],
    [0o755, 0o644],
  ]) {
    await t.test(`preserves ${localMode.toString(8)}`, async t => {
      const { source, root, put, commit, update } = await fixture(t);
      const path = "src/scripts/command.sh";
      await put(source, path, "old\n", beforeMode);
      const previous = commit();
      await put(root, path, "old\n", localMode);
      await put(source, path, "incoming\n");
      const revision = commit();
      assert.deepEqual(await update(previous, revision), [path]);
      assert.equal(await readFile(join(root, path), "utf8"), "incoming\n");
      assert.equal((await stat(join(root, path))).mode & 0o777, localMode);
      assert.deepEqual(await update(revision, revision), []);
    });
  }
});

test("upstream content and mode changes merge with independent local content", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const path = "src/scripts/command.sh";
  const content = "local = old;\n\n\n\n\nremote = old;\n";
  await put(source, path, content, 0o644);
  const previous = commit();
  await put(
    root,
    path,
    content.replace("local = old", "local = personal"),
    0o644
  );
  await put(
    source,
    path,
    content.replace("remote = old", "remote = incoming"),
    0o755
  );
  assert.deepEqual(await update(previous, commit()), [path]);
  const merged = await readFile(join(root, path), "utf8");
  assert.match(merged, /local = personal/);
  assert.match(merged, /remote = incoming/);
  assert.equal((await stat(join(root, path))).mode & 0o777, 0o755);
});

test("mode conflicts protect deletions until their local resolution is explicit", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const removed = "src/scripts/old.sh";
  const added = "src/scripts/new.sh";
  await put(source, removed, "old\n", 0o644);
  const previous = commit();
  await put(root, removed, "old\n", 0o755);
  await rm(join(source, removed));
  await put(source, added, "new\n", 0o755);
  const revision = commit();
  await assert.rejects(
    update(previous, revision),
    /old.sh \(mode\)[\s\S]*No files changed/
  );
  assert.equal((await stat(join(root, removed))).mode & 0o777, 0o755);
  await assert.rejects(readFile(join(root, added)), { code: "ENOENT" });
  assert.deepEqual(
    await update(previous, revision, {
      resolvedFiles: [removed],
      resolvedRevision: revision,
    }),
    [added]
  );
  assert.equal((await stat(join(root, removed))).mode & 0o777, 0o755);
  assert.equal((await stat(join(root, added))).mode & 0o777, 0o755);
});

test("reviewed content resolutions retain the local file mode", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const path = "src/scripts/command.sh";
  await put(source, path, "old\n", 0o644);
  const previous = commit();
  await put(root, path, "personal and incoming\n", 0o644);
  await put(source, path, "incoming\n", 0o755);
  const revision = commit();
  assert.deepEqual(
    await update(previous, revision, {
      resolvedFiles: [path],
      resolvedRevision: revision,
    }),
    []
  );
  assert.equal(
    await readFile(join(root, path), "utf8"),
    "personal and incoming\n"
  );
  assert.equal((await stat(join(root, path))).mode & 0o777, 0o644);
});

test("locally removed unused assets stay removed across unrelated updates", async t => {
  const { source, root, put, commit, update } = await fixture(t);
  const font = "src/assets/fonts/dm-sans.ttf";
  await put(source, font, Buffer.from([0, 1, 2]));
  await put(source, "src/styles/portfolio.css", "old");
  const previous = commit();
  await put(root, "src/styles/portfolio.css", "old");
  await put(source, "src/styles/portfolio.css", "new");
  const revision = commit();
  assert.deepEqual(await update(previous, revision), [
    "src/styles/portfolio.css",
  ]);
  await assert.rejects(readFile(join(root, font)), { code: "ENOENT" });
  assert.deepEqual(await update(revision, revision), []);
});
