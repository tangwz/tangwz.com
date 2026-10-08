import { slugifyStr } from "./slugify.ts";

type VideoCategory = {
  slug: string;
  name: string;
  color: "yellow" | "blue" | "purple" | "coral";
};

const presets: VideoCategory[] = [
  { slug: "productivity", name: "Productivity", color: "yellow" },
  { slug: "programming", name: "Programming", color: "blue" },
  { slug: "creating", name: "Creating", color: "purple" },
  { slug: "business", name: "Business", color: "coral" },
];

export function getVideoCategories(
  videos: readonly { data: { categories: readonly string[] } }[]
): VideoCategory[] {
  const names = new Set(videos.flatMap(video => video.data.categories));
  const knownNames = new Set(presets.map(category => category.name));
  const usedSlugs = new Set(presets.map(category => category.slug));
  const custom = [...names]
    .filter(name => !knownNames.has(name))
    .sort()
    .map(name => {
      const base = slugifyStr(name) || "category";
      let slug = base;
      let suffix = 2;
      while (usedSlugs.has(slug)) slug = `${base}-${suffix++}`;
      usedSlugs.add(slug);
      return { name, slug, color: "purple" as const };
    });

  return [...presets.filter(category => names.has(category.name)), ...custom];
}
