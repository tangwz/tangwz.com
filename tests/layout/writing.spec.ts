import { expect, test } from "@playwright/test";

for (const prefix of ["", "/en"]) {
  test(`${prefix}/posts filters every page by its actual tags after client navigation`, async ({
    page,
  }) => {
    await page.goto(`${prefix}/posts/`);
    await page.evaluate(() => Reflect.set(window, "__writingNavigation", true));
    let currentPage = 1;
    let totalPages = 1;
    const visited = new Set<string>();

    while (true) {
      expect(visited.has(page.url())).toBe(false);
      visited.add(page.url());
      const root = page.locator("[data-writing-collection]");
      await expect(root).toHaveAttribute("data-bound", "true");
      const cards = root.locator(".article-list > li");
      const articles = await cards.evaluateAll(items =>
        items.map(item => ({
          href: item.querySelector("a")!.getAttribute("href"),
          tags: JSON.parse(item.getAttribute("data-tags") ?? "[]") as string[],
        }))
      );
      expect(articles.length).toBeGreaterThan(0);
      const topics = [...new Set(articles.flatMap(article => article.tags))];
      const filters = root.locator(".filter-button[data-topic]");
      expect(
        await filters.evaluateAll(buttons =>
          buttons.map(button => button.getAttribute("data-topic"))
        )
      ).toEqual(topics);

      for (let index = 0; index < topics.length; index++) {
        const expected = articles
          .filter(article => article.tags.includes(topics[index]))
          .map(article => article.href);
        expect(expected.length).toBeGreaterThan(0);
        await filters.nth(index).click();
        await expect(filters.nth(index)).toHaveAttribute(
          "aria-pressed",
          "true"
        );
        const visible = cards.filter({ visible: true });
        await expect(visible).toHaveCount(expected.length);
        expect(
          await visible.evaluateAll(items =>
            items.map(item => item.querySelector("a")!.getAttribute("href"))
          )
        ).toEqual(expected);
        await expect(root.locator("#writing-empty")).toBeHidden();
      }

      await root.locator("[data-writing-all]").click();
      await expect(cards.filter({ visible: true })).toHaveCount(
        articles.length
      );
      await expect(root.locator("[data-writing-all]")).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      for (const filter of await filters.all())
        await expect(filter).toHaveAttribute("aria-pressed", "false");

      const pagination = page.locator(
        'nav[aria-label="Pagination Navigation"]'
      );
      const pageNumbers = (await pagination.textContent())?.match(
        /(\d+)\s*\/\s*(\d+)/
      );
      expect(Number(pageNumbers?.[1])).toBe(currentPage);
      totalPages = Number(pageNumbers?.[2]);
      const links = await pagination
        .locator("a")
        .evaluateAll(anchors =>
          anchors.map(anchor => anchor.getAttribute("href")!)
        );
      const next = links.find(href => {
        const match = new URL(href, page.url()).pathname.match(
          /\/posts\/(\d+)\/?$/
        );
        return Number(match?.[1]) === currentPage + 1;
      });
      if (currentPage === totalPages) {
        expect(next).toBeUndefined();
        break;
      }
      expect(next).toBeDefined();
      const expectedURL = new URL(next!, page.url());
      await pagination.locator(`a[href="${next}"]`).click();
      await expect(page).toHaveURL(
        url =>
          url.origin === expectedURL.origin &&
          url.pathname.replace(/\/$/, "") ===
            expectedURL.pathname.replace(/\/$/, "") &&
          url.search === expectedURL.search &&
          url.hash === expectedURL.hash
      );
      expect(
        await page.evaluate(() => Reflect.get(window, "__writingNavigation"))
      ).toBe(true);
      currentPage++;
    }
    expect(visited.size).toBe(totalPages);
    expect(visited.size).toBeGreaterThan(1);
  });
}
