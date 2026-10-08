import type { CollectionEntry } from "astro:content";
import { postFilter } from "./postFilter";

export type CreatorVideo = CollectionEntry<"videos">;

export function getCreatorVideos(videos: CreatorVideo[]) {
  return videos
    .filter(postFilter)
    .sort(
      (a, b) => b.data.pubDatetime.getTime() - a.data.pubDatetime.getTime()
    );
}
