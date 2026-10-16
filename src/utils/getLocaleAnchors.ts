import { render, type CollectionEntry } from "astro:content";
import type { MarkdownHeading } from "astro";
import { contentSlug, resolveLocale } from "@/i18n/routing";
import { createAnchorMap } from "@/i18n/anchors";
import { getLocalizedPosts, getLocalizedVideos } from "./getLocalizedContent";

export async function getLocaleAnchors(
  entry: CollectionEntry<"posts" | "videos">,
  headings: MarkdownHeading[],
  locale: string
) {
  const targetLocale = resolveLocale(locale) === "en" ? "zh" : "en";
  const entries = await (entry.collection === "posts"
    ? getLocalizedPosts(targetLocale)
    : getLocalizedVideos(targetLocale));
  const translated = entries.find(
    candidate => contentSlug(candidate.id) === contentSlug(entry.id)
  );
  const targetHeadings =
    !translated || translated.id === entry.id
      ? headings
      : (await render(translated)).headings;
  return createAnchorMap(headings, targetHeadings);
}
