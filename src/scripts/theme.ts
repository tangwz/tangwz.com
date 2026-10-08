import { switchLocaleUrl, resolveLocale } from "@/i18n/routing";
import { remapLocaleHash } from "@/i18n/anchors";

import { resolveColorTheme, type ColorTheme as Theme } from "./colorTheme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem("theme");
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}
let preference = storedTheme();
const effectiveTheme = (): Theme =>
  resolveColorTheme(
    preference,
    media.matches,
    document.documentElement.dataset.themeMode !== "light"
  );

function reflect() {
  const theme = effectiveTheme();
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  const button = document.querySelector<HTMLButtonElement>("#theme-btn");
  if (button) {
    button.setAttribute(
      "aria-label",
      button.dataset[theme === "dark" ? "lightLabel" : "darkLabel"] ??
        "Toggle color theme"
    );
    button.setAttribute("aria-pressed", String(theme === "dark"));
  }
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", getComputedStyle(document.body).backgroundColor);
}
function syncLocaleLink() {
  const link = document.querySelector<HTMLAnchorElement>(
    "[data-locale-switch]"
  );
  if (link) {
    const target = new URL(
      switchLocaleUrl(
        window.location.href,
        resolveLocale(link.hreflang),
        import.meta.env.BASE_URL
      ),
      window.location.origin
    );
    const anchors = document.querySelector<HTMLElement>("[data-locale-anchors]")
      ?.dataset.localeAnchors;
    if (anchors)
      target.hash = remapLocaleHash(target.hash, JSON.parse(anchors));
    link.href = target.href;
  }
}
function setup() {
  reflect();
  syncLocaleLink();
  const button = document.querySelector<HTMLButtonElement>("#theme-btn");
  if (button)
    button.onclick = () => {
      preference = effectiveTheme() === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("theme", preference);
      } catch {
        /* Selection still applies to this session. */
      }
      reflect();
    };
  const link = document.querySelector<HTMLAnchorElement>(
    "[data-locale-switch]"
  );
  if (link) link.onclick = syncLocaleLink;
}
setup();
document.addEventListener("astro:page-load", setup);
document.addEventListener("astro:before-swap", event => {
  const next = (event as { newDocument: Document }).newDocument;
  const theme = effectiveTheme();
  next.documentElement.dataset.theme = theme;
  next.documentElement.classList.toggle("dark", theme === "dark");
  const color = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");
  if (color)
    next
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", color);
});
media.addEventListener("change", () => {
  if (!preference) reflect();
});
window.addEventListener("storage", event => {
  if (event.key === "theme" || event.key === null) {
    preference = storedTheme();
    reflect();
  }
});
window.addEventListener("popstate", syncLocaleLink);
window.addEventListener("hashchange", syncLocaleLink);
document.addEventListener("click", syncLocaleLink);

document.addEventListener("locale:url-change", syncLocaleLink);
