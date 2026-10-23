import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(
      url =>
        /(^|\.)(googletagmanager|google-analytics)\.com$/.test(url.hostname),
      route =>
        route.fulfill({ contentType: "application/javascript", body: "" })
    );
    await use(context);
  },
});
