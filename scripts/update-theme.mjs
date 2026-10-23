import { execFileSync, spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";

const repository = "https://github.com/tangwz/tang.git";
const rootFiles = new Set([
  "astro.config.ts",
  "tsconfig.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".prettierrc",
  "eslint.config.js",
  ".env.example",
  "LICENSE",
  "scripts/check-build.mjs",
  "scripts/check-release.mjs",
]);

export function isThemeFile(path) {
  if (path.startsWith("src/content/") || path.startsWith("src/data/"))
    return false;
  if (path.startsWith("src/pages/design/")) return false;
  return (
    path.startsWith("src/") ||
    path.startsWith("public/images/") ||
    rootFiles.has(path)
  );
}

export function destinationPath(path) {
  return path.replace(/^src\/pages\/zh\//, "src/pages/en/");
}

function adaptRouteSource(path, content) {
  if (!path.startsWith("src/pages/") || !/\.(astro|ts)$/.test(path))
    return content;
  const original = path.startsWith("src/pages/zh/") ? "zh" : "en";
  const locale = original === "zh" ? "en" : "zh";
  const calls =
    /\b(getArticlePaths|getVideoPaths|getBookPaths|getLetterPaths|getWritingPaths|getTagPaths|getOgPaths|getRelativeLocaleUrl|createRss)(\(\s*)(["'])(en|zh)\3/g;
  return Buffer.from(
    content
      .toString()
      .replace(calls, (match, name, spacing, quote, language) =>
        language === original
          ? `${name}${spacing}${quote}${locale}${quote}`
          : match
      )
  );
}

function git(source, args) {
  return execFileSync("git", ["-C", source, ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

export async function fetchTheme(
  source,
  ref,
  { run = git, wait = delay } = {}
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return run(source, ["fetch", "--depth=1", "origin", ref]);
    } catch (error) {
      if (attempt === 2) throw error;
      await wait(500 * (attempt + 1));
    }
  }
}

function themeTree(source, revision) {
  const entries = git(source, ["ls-tree", "-rz", revision])
    .toString()
    .split("\0");
  const tree = new Map();
  for (const entry of entries.filter(Boolean)) {
    const match = entry.match(/^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/);
    if (!match) throw new Error(`Invalid Git tree entry: ${entry}`);
    const [, mode, type, blob, path] = match;
    if (!isThemeFile(path)) continue;
    if (
      type !== "blob" ||
      !["100644", "100755"].includes(mode) ||
      path.split("/").some(part => part === ".." || part === ".")
    )
      throw new Error(`Unsupported theme file: ${path}`);
    const destination = destinationPath(path);
    if (tree.has(destination))
      throw new Error(`Theme paths collide at ${destination}`);
    tree.set(destination, { blob, mode, path });
  }
  return tree;
}

function same(left, right) {
  return left === undefined || right === undefined
    ? left === right
    : left.equals(right);
}

class ThemeConflict extends Error {
  constructor(path) {
    super(`Conflicting changes: ${path}`);
  }
}

function mergeValue(base, local, incoming, path) {
  if (isDeepStrictEqual(local, base)) return incoming;
  if (isDeepStrictEqual(incoming, base) || isDeepStrictEqual(local, incoming))
    return local;
  const object = value =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if ([base, local, incoming].every(object)) {
    const result = {};
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(incoming),
    ])) {
      const value = mergeValue(
        base[key],
        local[key],
        incoming[key],
        `${path}.${key}`
      );
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  throw new ThemeConflict(path);
}

async function mergeFile(base, local, incoming, path, temporary) {
  if (same(local, base)) return incoming;
  if (same(incoming, base) || same(local, incoming)) return local;
  if (
    !base ||
    !local ||
    !incoming ||
    [base, local, incoming].some(value => value.includes(0))
  )
    throw new ThemeConflict(path);
  if (path === "package.json") {
    const merged = mergeValue(
      JSON.parse(base),
      JSON.parse(local),
      JSON.parse(incoming),
      path
    );
    return Buffer.from(JSON.stringify(merged, null, 2) + "\n");
  }
  const files = ["local", "base", "incoming"].map(name =>
    join(temporary, name)
  );
  await writeFile(files[0], local);
  await writeFile(files[1], base);
  await writeFile(files[2], incoming);
  const result = spawnSync("git", ["merge-file", "-p", ...files], {
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status > 0 && result.status <= 127) throw new ThemeConflict(path);
  if (result.status !== 0)
    throw new Error(`Cannot merge ${path}: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

async function readLocal(root, path) {
  let target = root;
  let metadata;
  for (const part of path.split("/")) {
    target = join(target, part);
    try {
      metadata = await lstat(target);
      if (metadata.isSymbolicLink())
        throw new Error(`Cannot update a symbolic link: ${path}`);
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  }
  return {
    content: await readFile(target),
    mode: metadata.mode & 0o100 ? "100755" : "100644",
  };
}

/** Plan every merge before writing, so conflicts cannot leave a partial update. */
export async function applyThemeUpdate({
  root,
  source,
  previous,
  revision,
  resolvedFiles = [],
  resolvedRevision,
}) {
  if (
    resolvedFiles.length &&
    (!/^[a-f0-9]{40}$/.test(resolvedRevision ?? "") ||
      resolvedRevision !== revision)
  )
    throw new Error(
      "Resolved files require the exact reviewed theme revision."
    );
  const resolutions = new Set();
  for (const path of resolvedFiles) {
    if (
      typeof path !== "string" ||
      /[\\\0]/.test(path) ||
      path.split("/").some(part => ["", ".", ".."].includes(part))
    )
      throw new Error(`Invalid resolved file path: ${path}`);
    if (resolutions.has(path))
      throw new Error(`Duplicate resolved file: ${path}`);
    resolutions.add(path);
  }
  const before = themeTree(source, previous);
  const after = themeTree(source, revision);
  const temporary = await mkdtemp(join(tmpdir(), "tang-merge-"));
  const changes = [];
  const conflicts = [];
  try {
    for (const path of new Set([...before.keys(), ...after.keys()])) {
      const oldEntry = before.get(path);
      const newEntry = after.get(path);
      const base =
        oldEntry &&
        adaptRouteSource(
          oldEntry.path,
          git(source, ["cat-file", "blob", oldEntry.blob])
        );
      const incoming =
        newEntry &&
        adaptRouteSource(
          newEntry.path,
          git(source, ["cat-file", "blob", newEntry.blob])
        );
      const localFile = await readLocal(root, path);
      const local = localFile?.content;
      try {
        const content = await mergeFile(base, local, incoming, path, temporary);
        const mode = mergeValue(
          oldEntry?.mode,
          localFile?.mode,
          newEntry?.mode,
          `${path} (mode)`
        );
        if (!same(content, local) || mode !== localFile?.mode)
          changes.push({ path, content, mode });
      } catch (error) {
        if (error instanceof ThemeConflict && resolutions.has(path))
          resolutions.delete(path);
        else conflicts.push(error.message);
      }
    }
    for (const path of resolutions)
      conflicts.push(`Resolved file did not conflict: ${path}`);
    if (conflicts.length)
      throw new Error(
        `${conflicts.join("\n")}\nNo files changed. Resolve the conflicts and rerun with --ref <reviewed SHA> --resolved-file <path>.`
      );
    for (const { path, content, mode } of changes) {
      const target = join(root, path);
      if (content === undefined) await rm(target);
      else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
        await chmod(target, mode === "100755" ? 0o755 : 0o644);
      }
    }
    return changes.map(change => change.path);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      check: { type: "boolean" },
      ref: { type: "string" },
      "resolved-file": { type: "string", multiple: true, default: [] },
    },
  });
  const resolvedFiles = values["resolved-file"];
  if (
    resolvedFiles.length &&
    (values.check || !/^[a-f0-9]{40}$/.test(values.ref ?? ""))
  )
    throw new Error("--resolved-file requires --ref with a full commit SHA.");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const lockPath = join(root, "theme.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const ref = values.ref ?? lock.ref;
  if (
    lock.schemaVersion !== 1 ||
    lock.repository !== repository ||
    !/^[a-f0-9]{40}$/.test(lock.revision) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(ref)
  )
    throw new Error("Invalid theme lock or ref.");
  if (
    !values.check &&
    git(root, ["status", "--porcelain", "--untracked-files=all"]).length
  )
    throw new Error("Commit or stash local changes before updating the theme.");
  const source = await mkdtemp(join(tmpdir(), "tang-source-"));
  try {
    git(source, ["init", "-q"]);
    git(source, ["remote", "add", "origin", repository]);
    await fetchTheme(source, ref);
    const revision = git(source, ["rev-parse", "FETCH_HEAD"]).toString().trim();
    process.stdout.write(
      `Tang: ${lock.revision.slice(0, 7)} -> ${revision.slice(0, 7)}\n`
    );
    if (
      values.check ||
      (!resolvedFiles.length && revision === lock.revision && ref === lock.ref)
    )
      return;
    await fetchTheme(source, lock.revision);
    const changes = await applyThemeUpdate({
      root,
      source,
      previous: lock.revision,
      revision,
      resolvedFiles,
      resolvedRevision: values.ref,
    });
    await writeFile(
      lockPath,
      JSON.stringify({ ...lock, ref, revision }, null, 2) + "\n"
    );
    process.stdout.write(`Updated ${changes.length} theme files.\n`);
    process.stdout.write("Next: npm run theme:verify\n");
  } finally {
    await rm(source, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
