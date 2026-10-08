import { readFile } from "node:fs/promises";
import sitemap from "@astrojs/sitemap";
import { getLanguageAlternates } from "./htmlSeo";

/** Derive sitemap eligibility from the robots metadata used by each page. */
export function indexableSitemap() {
  let outDir: URL;
  let base = "/";
  const integration = sitemap({
    serialize: async item => {
      const pathname = decodeURIComponent(new URL(item.url).pathname);
      const relativePath = pathname.slice(base.length).replace(/^\/+/, "");
      const file = relativePath.endsWith(".html")
        ? relativePath
        : `${relativePath.replace(/\/+$/, "")}/index.html`.replace(/^\//, "");
      const html = await readFile(new URL(file, outDir), "utf8");
      return /<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html)
        ? undefined
        : { ...item, links: getLanguageAlternates(html) };
    },
  });
  const configure = integration.hooks["astro:config:done"];
  integration.hooks["astro:config:done"] = async options => {
    outDir = options.config.outDir;
    base = `${options.config.base.replace(/\/+$/, "")}/`;
    await configure?.(options);
  };
  return integration;
}
