import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import config from "@/config";
import { resolveBilibiliVideo } from "./utils/bilibili";
import { isPublicImagePath } from "./utils/assetPaths";

export const BLOG_PATH = "src/content/posts";

const posts = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: `./${BLOG_PATH}` }),
  schema: ({ image }) =>
    z.object({
      author: z.string().default(config.site.author),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      title: z.string(),
      lang: z.enum(["en", "zh"]).default("zh"),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      template: z.boolean().default(false),
      sample: z.boolean().default(false),
      tags: z.array(z.string()).default(["others"]),
      ogImage: image().or(z.string()).optional(),
      // Astro's image helper treats every string as an import.
      coverImage: z.string().refine(isPublicImagePath).or(image()).optional(),
      coverColor: z.enum(["blue", "coral", "yellow", "purple"]).default("blue"),
      description: z.string(),
      canonicalURL: z.string().optional(),
      hideEditPost: z.boolean().optional(),
      timezone: z.string().optional(),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    canonicalURL: z.string().optional(),
  }),
});

const videos = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/videos" }),
  schema: z
    .object({
      title: z.string(),
      lang: z.enum(["en", "zh"]).default("zh"),
      description: z.string(),
      pubDatetime: z.date(),
      categories: z.array(z.string()).min(1),
      image: z.string(),
      label: z.string(),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
      sample: z.boolean().default(false),
      bilibiliUrl: z
        .string()
        .default("")
        .refine(
          value => !value || resolveBilibiliVideo(value) !== null,
          "Use a Bilibili video URL, BV identifier, AV identifier, or b23.tv share link."
        ),
    })
    .refine(
      data => data.draft || data.sample || Boolean(data.bilibiliUrl.trim()),
      {
        message:
          "Published videos need a Bilibili URL. Use draft or sample for unfinished content.",
        path: ["bilibiliUrl"],
      }
    ),
});

export const collections = { posts, pages, videos };
