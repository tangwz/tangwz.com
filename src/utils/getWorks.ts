import { contentSlug } from "@/i18n/routing";
import { translate } from "@/i18n/creator";
import { getRelativeLocaleUrl } from "astro:i18n";
import { books, getBooks, creator } from "@/data/creator";
import { getLetters } from "@/data/letters";
import { getLocalizedPosts, getLocalizedVideos } from "./getLocalizedContent";
import { getCreatorPosts } from "./getCreatorPosts";
import { getCreatorVideos } from "./getCreatorVideos";
import { getPostUrl } from "./getPostPaths";
import { getAssetPath, getCoverImagePath } from "./withBase";

export const workTypes = [
  { value: "all", label: "All work" },
  { value: "article", label: "Articles" },
  { value: "video", label: "Videos" },
  { value: "reading", label: "Reading notes" },
  { value: "letter", label: "Newsletter" },
] as const;

export type WorkItem = {
  id: string;
  type: Exclude<(typeof workTypes)[number]["value"], "all">;
  title: string;
  description: string;
  href: string;
  date?: Date;
  timezone?: string;
  image?: string;
  label?: string;
  book?: (typeof books)[number];
  sample?: boolean;
};

export async function getWorks(locale: string): Promise<WorkItem[]> {
  const [posts, videos] = await Promise.all([
    getLocalizedPosts(locale),
    getLocalizedVideos(locale),
  ]);
  const href = (path: string) => getRelativeLocaleUrl(locale, path);
  const articleImages = [
    creator.images.writing,
    creator.images.desk,
    creator.images.landscape,
  ];
  const dated: (WorkItem & { date: Date })[] = [
    ...getCreatorPosts(posts).map((post, index) => ({
      id: `article-${post.id}`,
      type: "article" as const,
      title: post.data.title,
      description: post.data.description,
      href: getPostUrl(post.id, post.filePath, locale),
      date: post.data.pubDatetime,
      timezone: post.data.timezone,
      sample: post.data.sample,
      image:
        getCoverImagePath(post.data.coverImage) ??
        articleImages[index % articleImages.length],
    })),
    ...getCreatorVideos(videos).map(video => ({
      id: `video-${video.id}`,
      type: "video" as const,
      title: video.data.title,
      description: video.data.description,
      href: href(`videos/${contentSlug(video.id)}`),
      date: video.data.pubDatetime,
      sample: video.data.sample,
      image: getAssetPath(video.data.image),
      label: video.data.label,
    })),
  ];
  dated.sort((a, b) => b.date.getTime() - a.date.getTime());
  return [
    ...dated,
    ...getBooks(locale).map(book => ({
      id: `reading-${book.slug}`,
      type: "reading" as const,
      title: book.title,
      description: book.note,
      href: href(`books/${book.slug}`),
      label: book.author,
      book,
      sample: book.sample,
    })),
    ...getLetters(locale).map(letter => ({
      id: `letter-${letter.slug}`,
      type: "letter" as const,
      title: letter.title,
      description: letter.intro,
      href: href(`newsletter/${letter.slug}`),
      label: `${translate(locale, "Letter")} ${letter.number}`,
      sample: letter.sample,
    })),
  ];
}
