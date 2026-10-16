import rss from "@astrojs/rss";
import { getCreatorPosts } from "@/utils/getCreatorPosts";
import { getPostUrl } from "@/utils/getPostPaths";
import { getLocalizedPosts } from "@/utils/getLocalizedContent";
import { translate } from "@/i18n/creator";
import config from "@/config";
import { getRelativeLocaleUrl } from "astro:i18n";

export async function createRss(locale: string) {
  const posts = await getLocalizedPosts(locale);
  const sortedPosts = getCreatorPosts(
    posts.filter(post => post.data.lang === locale)
  );

  return rss({
    title: translate(locale, config.site.title),
    description: translate(locale, config.site.description),
    site: new URL(getRelativeLocaleUrl(locale, ""), config.site.url),
    customData: `<language>${locale === "zh" ? "zh-CN" : "en"}</language>`,
    items: sortedPosts.map(({ data, id, filePath }) => ({
      link: getPostUrl(id, filePath, locale),
      title: data.title,
      description: data.description,
      pubDate: new Date(data.modDatetime ?? data.pubDatetime),
    })),
  });
}

export const GET = () => createRss("zh");
