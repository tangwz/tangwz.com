import { getCollection, type CollectionEntry } from "astro:content";
import { selectLocalizedEntries, getEntryLocales } from "@/i18n/routing";
import { postFilter } from "./postFilter";

export async function getContentLocales(
  entry: CollectionEntry<"posts" | "videos">
) {
  return getEntryLocales(
    entry,
    await getCollection(entry.collection, postFilter)
  );
}

export async function getLocalizedPosts(locale: string) {
  const posts = await getCollection("posts", postFilter);
  return selectLocalizedEntries(posts, locale);
}

export async function getLocalizedVideos(locale: string) {
  return selectLocalizedEntries(
    await getCollection("videos", postFilter),
    locale
  );
}
