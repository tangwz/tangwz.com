import { expect, test } from "./fixtures";
import config from "../../astro-paper.config";

for (const prefix of ["", "/en"]) {
  test(`${prefix || "/"} initializes analytics once across client navigation`, async ({
    page,
  }) => {
    const id = config.site.googleAnalyticsId?.trim();
    let loaderRequests = 0;
    page.on("request", request => {
      if (request.url().startsWith("https://www.googletagmanager.com/gtag/js?"))
        loaderRequests++;
    });
    await page.goto(`${prefix}/`);
    const loader = page.locator(
      'script[src^="https://www.googletagmanager.com/gtag/js?"]'
    );
    if (!id) {
      await expect(loader).toHaveCount(0);
      expect(loaderRequests).toBe(0);
      return;
    }
    await expect(loader).toHaveAttribute(
      "src",
      `https://www.googletagmanager.com/gtag/js?id=${id}`
    );
    await page.evaluate(() => {
      Reflect.set(
        window,
        "__analyticsLoader",
        document.querySelector(
          'script[src^="https://www.googletagmanager.com/gtag/js?"]'
        )
      );
    });
    const expectOneInitialization = async () => {
      const commands = await page.evaluate(() =>
        (Reflect.get(window, "dataLayer") as IArguments[]).map(args =>
          Array.from(args)
        )
      );
      expect(commands.map(command => command[0])).toEqual(["js", "config"]);
      expect(commands[1]).toEqual(["config", id]);
    };
    await expectOneInitialization();

    for (const path of [`${prefix}/about/`, `${prefix}/`]) {
      await page.locator(`a[href="${path}"]`).first().click();
      await expect(page).toHaveURL(url => url.pathname === path);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              Reflect.get(window, "__analyticsLoader") ===
              document.querySelector(
                'script[src^="https://www.googletagmanager.com/gtag/js?"]'
              )
          )
        )
        .toBe(true);
      await expectOneInitialization();
      expect(loaderRequests).toBe(1);
    }

    await page.locator(`a[href="${prefix}/works/"]`).first().click();
    await expect(page).toHaveURL(url => url.pathname === `${prefix}/works/`);
    await expect
      .poll(() =>
        page.evaluate(
          () => Reflect.get(window, "__analyticsLoader") === undefined
        )
      )
      .toBe(true);
    await expectOneInitialization();
    expect(loaderRequests).toBe(2);
  });
}
