import config from "@/config";
import { getAssetPath } from "@/utils/withBase";
import { getNewsletterSettings } from "@/utils/newsletterSettings";

export const creator = {
  name: config.site.author,
  tagline: "Writer. Creator. Developer.",
  newsletter: {
    name: "The Sunday Edit",
    shortName: "Sunday Edit",
    ...getNewsletterSettings({
      action: import.meta.env.PUBLIC_NEWSLETTER_FORM_ACTION,
      provider: import.meta.env.PUBLIC_NEWSLETTER_PROVIDER,
      privacyURL: import.meta.env.PUBLIC_NEWSLETTER_PRIVACY_URL,
      contactEmail: import.meta.env.PUBLIC_CONTACT_EMAIL,
    }),
  },
  bilibiliChannel:
    import.meta.env.PUBLIC_BILIBILI_CHANNEL_URL ??
    config.socials.find(link => link.name === "bilibili")?.url ??
    "",
  images: {
    portrait: "",
    desk: getAssetPath("images/creative-desk.jpg"),
    writing: getAssetPath("images/writing.jpg"),
    landscape: getAssetPath("images/landscape.jpg"),
  },
};

interface Book {
  sample: boolean;
  slug: string;
  title: string;
  subtitle: string;
  author: string;
  color: string;
  category: string;
  note: string;
}

interface Course {
  sample: boolean;
  slug: string;
  name: string;
  eyebrow: string;
  description: string;
  status: string;
  modules: { title: string; description: string }[];
}

export const books: Book[] = [];
export const courses: Course[] = [];

export function getBooks(_locale: string): Book[] {
  return books;
}

export function getCourses(_locale: string): Course[] {
  return courses;
}
