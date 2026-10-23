import type { CollectionEntry } from "astro:content";
import { getSortedPosts } from "./getSortedPosts";
import { isPublicWork } from "./publication";

export function isCreatorPost(post: CollectionEntry<"posts">) {
  return isPublicWork(post.data);
}

export function getCreatorPosts(posts: CollectionEntry<"posts">[]) {
  return getSortedPosts(posts).filter(isCreatorPost);
}
