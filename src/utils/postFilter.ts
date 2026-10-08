import config from "@/config";
import { isPublished, type PublicationData } from "./publication";

/**
 * Determines whether a post is eligible to be listed/rendered.
 *
 * - Excludes drafts always
 * - In production, excludes scheduled posts until `pubDatetime` minus the configured margin
 * - In dev, always shows non-draft posts to make authoring easier
 */
export function postFilter({ data }: { data: PublicationData }) {
  return isPublished(data, {
    development: import.meta.env.DEV,
    margin: config.posts.scheduledPostMargin,
  });
}
