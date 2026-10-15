import { expect, test } from "@playwright/test";

for (const route of ["/works/", "/en/works/"]) {
  test(`${route} fills the desktop grid and paginates all work`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1218, height: 853 });
    await page.goto(route);
    const collection = page.locator("[data-work-collection]");
    await expect(collection).toHaveAttribute("data-current-page", "1");
    const cards = collection.locator("[data-work-type]");
    const total = await cards.count();
    const pageSize = Number(await collection.getAttribute("data-page-size"));
    expect(pageSize % 3).toBe(0);
    expect(pageSize).toBeGreaterThanOrEqual(6);
    for (let index = 0; index < Math.ceil(total / pageSize); index++) {
      const visible = cards.filter({ visible: true });
      await expect(visible).toHaveCount(
        Math.min(pageSize, total - index * pageSize)
      );
      const layout = await collection
        .locator(".portfolio-work-grid")
        .evaluate(grid => {
          const style = getComputedStyle(grid);
          const visibleCards = [...grid.children].filter(
            element => !element.hasAttribute("hidden")
          );
          return {
            display: style.display,
            columns: style.gridTemplateColumns.split(" ").length,
            rows: new Set(
              visibleCards.map(element =>
                Math.round(element.getBoundingClientRect().top)
              )
            ).size,
          };
        });
      expect(layout.display).toBe("grid");
      expect(layout.columns).toBe(3);
      expect(layout.rows).toBe(Math.ceil((await visible.count()) / 3));
      if (index + 1 < Math.ceil(total / pageSize)) {
        await collection.locator("[data-work-next]").click();
        await expect(collection).toHaveAttribute(
          "data-current-page",
          String(index + 2)
        );
      }
    }
    await expect(collection.locator("[data-work-next]")).toBeDisabled();
  });
}

test("the work grid adapts to tablet and mobile without horizontal overflow", async ({
  page,
}) => {
  for (const [width, columns] of [
    [768, 2],
    [390, 1],
  ]) {
    await page.setViewportSize({ width, height: 853 });
    await page.goto("/works/");
    await expect(page.locator("[data-work-collection]")).toHaveAttribute(
      "data-current-page",
      "1"
    );
    const layout = await page
      .locator(".portfolio-work-grid")
      .evaluate(grid => ({
        display: getComputedStyle(grid).display,
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
    expect(layout).toEqual({ display: "grid", columns, overflow: false });
  }
});
