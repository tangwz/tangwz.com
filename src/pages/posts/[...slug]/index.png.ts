import type { APIRoute } from "astro";
import { getOgPaths } from "@/utils/getOgPaths";
import { generateOgImage } from "@/utils/generateOgImage";

export const getStaticPaths = () => getOgPaths("zh");

export const GET: APIRoute = ({ props, url }) =>
  generateOgImage(props.title, url, props.locale);
