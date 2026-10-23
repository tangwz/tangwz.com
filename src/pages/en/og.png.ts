import config from "@/config";
import type { APIRoute } from "astro";
import { generateOgImage } from "@/utils/generateOgImage";

export const GET: APIRoute = ({ url }) =>
  generateOgImage(
    `I'm ${config.site.author}. Writer, creator, and developer.`,
    url
  );
