import { expect, test } from "@playwright/test";
import config from "../../astro-paper.config";

test("legacy Chinese articles use localized footnotes in both locale routes", async ({
  page,
}) => {
  for (const prefix of ["", "/en"]) {
    await page.goto(`${prefix}/posts/202009-consensus/`);
    await expect(page.locator("#footnote-label")).toHaveText("\u811a\u6ce8");
    const references = page.locator("[data-footnote-backref]");
    expect(await references.count()).toBeGreaterThan(0);
    for (const reference of await references.all())
      await expect(reference).toHaveAttribute(
        "aria-label",
        "\u8fd4\u56de\u811a\u6ce8\u5f15\u7528"
      );
  }
});

test("the English About page is a non-indexable fallback to Chinese", async ({
  page,
  request,
}) => {
  const canonicalURL = new URL("about/", config.site.url).href;
  await page.goto("/about/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    canonicalURL
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  const content = await page.locator("main article").textContent();

  await page.goto("/en/about/");
  await expect(page.locator("main article")).toHaveAttribute("lang", "zh");
  await expect(page.locator("main article")).toHaveText(content ?? "");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    canonicalURL
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow"
  );
  await expect(page.locator("[data-pagefind-body]")).toHaveCount(0);
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(2);
  for (const language of ["zh-CN", "x-default"]) {
    await expect(
      page.locator(`link[rel="alternate"][hreflang="${language}"]`)
    ).toHaveAttribute("href", canonicalURL);
  }

  const sitemapIndex = await request.get("/sitemap-index.xml");
  const sitemapPaths = [
    ...(await sitemapIndex.text()).matchAll(/<loc>([^<]+)<\/loc>/g),
  ];
  expect(sitemapPaths.length).toBeGreaterThan(0);
  const sitemapDocuments = await Promise.all(
    sitemapPaths.map(async ([, url]) => {
      const response = await request.get(new URL(url).pathname);
      expect(response.ok()).toBe(true);
      return response.text();
    })
  );
  const sitemap = sitemapDocuments.join("\n");
  expect(sitemap).toContain(`<loc>${canonicalURL}</loc>`);
  expect(sitemap).not.toContain(new URL("en/about/", config.site.url).href);
});
