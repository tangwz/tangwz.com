import config from "@/config";
import { getLocalizedPosts } from "./getLocalizedContent";
import { getCreatorPosts } from "./getCreatorPosts";
import { getPostSlug } from "./getPostPaths";

export async function getOgPaths(locale: string) {
  if (!config.features.dynamicOgImage) return [];
  return getCreatorPosts(await getLocalizedPosts(locale))
    .filter(post => !post.data.ogImage)
    .map(post => ({
      params: { slug: getPostSlug(post.id, post.filePath) },
      props: { title: post.data.title, locale },
    }));
}
