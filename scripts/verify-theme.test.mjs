import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { verifyTheme } from "./verify-theme.mjs";

test("verification installs first and forces content synchronization before building", () => {
  const calls = [];
  verifyTheme({
    ci: false,
    run(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });
  assert.deepEqual(
    calls.map(({ command, args }) => [command, ...args]),
    [
      ["pnpm", "install", "--frozen-lockfile"],
      ["npm", "run", "sync", "--", "--force"],
      ["npm", "test"],
      ["npm", "run", "lint"],
      ["npm", "run", "format:check"],
      ["npm", "run", "build:release"],
      ["pnpm", "exec", "playwright", "install", "chromium"],
      ["npm", "run", "check:layout"],
    ]
  );
  for (const { options } of calls)
    assert.deepEqual(options, {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      stdio: "inherit",
    });
});

test("CI installs Chromium system dependencies", () => {
  const calls = [];
  verifyTheme({
    ci: true,
    run(command, args) {
      calls.push([command, ...args]);
      return { status: 0 };
    },
  });
  assert.deepEqual(calls[6], [
    "pnpm",
    "exec",
    "playwright",
    "install",
    "--with-deps",
    "chromium",
  ]);
});

test("a failed command prevents every subsequent verification step", () => {
  for (let failure = 0; failure < 8; failure++) {
    let calls = 0;
    assert.throws(
      () =>
        verifyTheme({
          run() {
            return { status: calls++ === failure ? 1 : 0 };
          },
        }),
      /Theme verification failed/
    );
    assert.equal(calls, failure + 1);
  }
});

test("spawn errors and terminated commands stop verification", () => {
  const error = new Error("Command is unavailable");
  for (const result of [
    { error, status: null },
    { status: null, signal: "SIGTERM" },
  ]) {
    let calls = 0;
    assert.throws(() =>
      verifyTheme({
        run() {
          calls++;
          return result;
        },
      })
    );
    assert.equal(calls, 1);
  }
});
