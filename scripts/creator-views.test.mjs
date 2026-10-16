import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "astro";
import { inspectPage, sampleNotices } from "./site-content.mjs";

test("real books and courses render without sample notices while samples retain them", async t => {
  const root = await mkdtemp(join(tmpdir(), "creator-views-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (path, content) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  await symlink(
    fileURLToPath(new URL("../node_modules", import.meta.url)),
    join(root, "node_modules"),
    "dir"
  );
  await put("package.json", '{"type":"module"}');
  await put(
    "src/config.ts",
    'export default { site: { title: "Fixture", author: "Author", lang: "zh" } };'
  );
  await put(
    "src/i18n/creator.ts",
    "export const useCreatorTranslations = () => (value: string) => value;"
  );
  await put(
    "src/data/creator.ts",
    `const entry = { slug: "fixture", title: "Real book", author: "Author", category: "Reading", note: "A personal note.", name: "Real course", description: "A personal course.", status: "Available", modules: [] };
export const getBooks = (locale: string) => [{ ...entry, sample: locale === "en" }];
export const getCourses = getBooks;`
  );
  await put("src/layouts/Layout.astro", "<html><body><slot /></body></html>");
  for (const name of [
    "Header",
    "Footer",
    "Newsletter",
    "BookCover",
    "CreatorIcon",
  ])
    await put(`src/components/${name}.astro`, "<span />");
  await put("src/views/NotFound.astro", "<h1>404</h1>");
  for (const name of ["Books", "Courses"]) {
    await mkdir(join(root, "src/views"), { recursive: true });
    await cp(
      new URL(`../src/views/${name}.astro`, import.meta.url),
      join(root, `src/views/${name}.astro`)
    );
    for (const prefix of ["", "en/"])
      await put(
        `src/pages/${prefix}${name.toLowerCase()}.astro`,
        `---\nimport View from "@/views/${name}.astro";\n---\n<View />`
      );
  }
  await build({
    root: pathToFileURL(root + "/"),
    configFile: false,
    logLevel: "silent",
    site: "https://fixture.invalid",
    i18n: {
      locales: ["zh", "en"],
      defaultLocale: "zh",
      routing: { prefixDefaultLocale: false },
    },
    vite: { resolve: { alias: { "@": join(root, "src") } } },
  });
  for (const name of ["books", "courses"]) {
    const real = await readFile(join(root, `dist/${name}/index.html`), "utf8");
    const sample = await readFile(
      join(root, `dist/en/${name}/index.html`),
      "utf8"
    );
    assert.match(real, /Real (book|course)/);
    assert.deepEqual(inspectPage(real, sampleNotices).errors, []);
    assert.match(
      inspectPage(sample, sampleNotices).errors.join(),
      /Theme sample notice/
    );
  }
});
