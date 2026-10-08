import config from "@/config";
import type { APIRoute } from "astro";
import { translate } from "@/i18n/creator";
import { generateOgImage } from "@/utils/generateOgImage";

export const GET: APIRoute = ({ url }) =>
  generateOgImage(
    translate("zh", "I'm {{name}}. Writer, creator, and developer.").replace(
      "{{name}}",
      config.site.author
    ),
    url,
    "zh"
  );
