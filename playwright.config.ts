import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/layout",
  workers: 1,
  reporter: "list",
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4432",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4432",
    url: "http://127.0.0.1:4432/works/",
    reuseExistingServer: false,
  },
});
