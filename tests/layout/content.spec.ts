import { expect, test } from "./fixtures";
import config from "../../astro-paper.config";

test("legacy formulas render membership symbols and configuration subscripts", async ({
  page,
}) => {
  for (const prefix of ["", "/en"]) {
    await page.goto(`${prefix}/posts/202207-tla-2/`);
    const membership = page.locator("main article mjx-container");
    await expect(membership).toHaveCount(1);
    await expect(membership.locator('[data-c="2208"]')).toHaveCount(1);

    await page.goto(`${prefix}/posts/202102-raft/`);
    const configurations = page.locator("main article mjx-container");
    expect(await configurations.count()).toBeGreaterThan(0);
    for (const formula of await configurations.all()) {
      await expect(formula).toHaveAttribute(
        "aria-label",
        /^C_\{(?:new|old\+new)\}$/
      );
      await expect(formula.locator('[data-mml-node="msub"]')).toHaveCount(1);
      await expect(formula.locator('[data-c="5F"]')).toHaveCount(0);
    }
  }
});

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
