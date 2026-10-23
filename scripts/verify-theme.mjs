import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export function verifyTheme({
  ci = Boolean(process.env.CI),
  run = spawnSync,
} = {}) {
  const commands = [
    ["pnpm", ["install", "--frozen-lockfile"]],
    ["npm", ["run", "sync", "--", "--force"]],
    ["npm", ["test"]],
    ["npm", ["run", "lint"]],
    ["npm", ["run", "format:check"]],
    ["npm", ["run", "build:release"]],
    [
      "pnpm",
      [
        "exec",
        "playwright",
        "install",
        ...(ci ? ["--with-deps"] : []),
        "chromium",
      ],
    ],
    ["npm", ["run", "check:layout"]],
  ];
  for (const [command, args] of commands) {
    const result = run(command, args, { cwd: root, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `Theme verification failed: ${command} ${args.join(" ")}`
      );
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  try {
    verifyTheme();
  } catch (error) {
    process.stderr.write(
      `${error.message}\nFix the failure and rerun npm run theme:verify. The theme candidate has been preserved.\n`
    );
    process.exitCode = 1;
  }
