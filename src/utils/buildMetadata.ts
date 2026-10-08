import type { AstroIntegration } from "astro";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

/** Record the resolved build settings, including CLI overrides, for validation. */
export function buildMetadata(): AstroIntegration {
  let site = "";
  let base = "/";
  return {
    name: "creator-build-metadata",
    hooks: {
      "astro:config:done": ({ config }) => {
        site = config.site ?? "";
        base = config.base;
      },
      "astro:build:done": async ({ dir }) => {
        let revision: string | null = null;
        let dirty = true;
        try {
          dirty = Boolean(
            execFileSync("git", ["status", "--porcelain"], {
              encoding: "utf8",
            }).trim()
          );
          revision = dirty
            ? null
            : execFileSync("git", ["rev-parse", "HEAD"], {
                encoding: "utf8",
              }).trim();
        } catch {
          /* Source archives may not include Git metadata. */
        }
        const pkg = JSON.parse(
          await readFile(new URL("../../package.json", import.meta.url), "utf8")
        );
        await writeFile(
          new URL("build-info.json", dir),
          JSON.stringify(
            {
              name: pkg.name,
              version: pkg.version,
              site: new URL(site).href,
              base,
              revision,
              dirty,
              validated: false,
              builtAt: new Date().toISOString(),
            },
            null,
            2
          ) + "\n"
        );
      },
    },
  };
}
