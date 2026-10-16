import type { GetStaticPathsOptions } from "astro";
import { contentSlug } from "@/i18n/routing";
import { getBooks } from "@/data/creator";
import { getLetters } from "@/data/letters";
import { getLocalizedPosts, getLocalizedVideos } from "./getLocalizedContent";
import { getSortedPosts } from "./getSortedPosts";
import { getCreatorPosts, isCreatorPost } from "./getCreatorPosts";
import { getCreatorVideos } from "./getCreatorVideos";
import { getPostSlug } from "./getPostPaths";
import { getUniqueTags } from "./getUniqueTags";
import { slugifyAll } from "./slugify";
import config from "@/config";

export async function getArticlePaths(locale: string) {
  const posts = await getLocalizedPosts(locale);
  const sorted = getSortedPosts(posts);
  const creatorPosts = getCreatorPosts(posts);
  return sorted.map(post => {
    const navigation = isCreatorPost(post) ? creatorPosts : sorted;
    const index = navigation.findIndex(item => item.id === post.id);
    const adjacent = (position: number) => {
      const item = navigation[position];
      return item
        ? { id: item.id, title: item.data.title, filePath: item.filePath }
        : null;
    };
    return {
      params: { slug: getPostSlug(post.id, post.filePath) },
      props: {
        post,
        relatedPosts: navigation
          .filter(item => item.id !== post.id)
          .slice(0, 2),
        prevPost: adjacent(index + 1),
        nextPost: adjacent(index - 1),
      },
    };
  });
}

export async function getVideoPaths(locale: string) {
  const videos = getCreatorVideos(await getLocalizedVideos(locale));
  return videos.map(video => ({
    params: { slug: contentSlug(video.id) },
    props: {
      video,
      relatedVideos: videos.filter(item => item.id !== video.id).slice(0, 2),
    },
  }));
}

export function getBookPaths(locale: string) {
  return getBooks(locale).map(book => ({
    params: { slug: book.slug },
    props: { book },
  }));
}

export function getLetterPaths(locale: string) {
  return getLetters(locale).map(letter => ({
    params: { slug: letter.slug },
    props: { letter },
  }));
}

export async function getWritingPaths(
  locale: string,
  { paginate }: GetStaticPathsOptions
) {
  const posts = await getLocalizedPosts(locale);
  return paginate(getCreatorPosts(posts), { pageSize: config.posts.perPage });
}

export async function getTagPaths(
  locale: string,
  { paginate }: GetStaticPathsOptions
) {
  const posts = getCreatorPosts(await getLocalizedPosts(locale));
  return getUniqueTags(posts).flatMap(({ tag, tagName }) =>
    paginate(
      posts.filter(({ data }) => slugifyAll(data.tags).includes(tag)),
      { params: { tag }, props: { tagName }, pageSize: config.posts.perPage }
    )
  );
}
