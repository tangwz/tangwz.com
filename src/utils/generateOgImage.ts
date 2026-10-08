import { fontData, experimental_getFontFileURL } from "astro:assets";
import satori from "satori";
import sharp from "sharp";
import { getFontPathByWeight } from "./getFontPathByWeight";
import config from "@/config";
import { translate } from "@/i18n/creator";

export async function generateOgImage(title: string, url: URL, locale = "en") {
  const tr = (source: string) => translate(locale, source);
  const sansPath = getFontPathByWeight(fontData["--font-arimo"], 400);
  const serifPath = getFontPathByWeight(fontData["--font-fraunces"], 600);
  const cjkPath = getFontPathByWeight(fontData["--font-og-cjk"], 500);
  const needsCjk = locale === "zh" || /[\u2e80-\u9fff]/u.test(title);
  if (!sansPath || !serifPath)
    throw new Error("Missing local social image fonts.");
  if (needsCjk && !cjkPath)
    throw new Error("Missing local Chinese social image font.");
  const [sans, serif, cjk] = await Promise.all(
    [sansPath, serifPath, ...(needsCjk && cjkPath ? [cjkPath] : [])].map(
      async path => {
        const response = await fetch(experimental_getFontFileURL(path, url));
        if (!response.ok)
          throw new Error(
            `Unable to load social image font: ${response.status}`
          );
        return response.arrayBuffer();
      }
    )
  );
  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "65px 75px",
          background: "#f9f6f3",
          color: "#1b1624",
          width: "100%",
          height: "100%",
          fontFamily: "Arimo, Noto Sans SC",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                fontSize: 18,
                letterSpacing: 2,
              },
              children: [
                {
                  type: "span",
                  props: { children: tr("WRITER. CREATOR. DEVELOPER.") },
                },
                {
                  type: "span",
                  props: {
                    style: { color: "#156882" },
                    children: tr("WORDS / STORIES / CODE"),
                  },
                },
              ],
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                fontFamily: "Fraunces, Noto Sans SC",
                fontWeight: 600,
                fontSize: title.length > 65 ? 62 : locale === "zh" ? 76 : 84,
                lineHeight: 1.1,
                letterSpacing: -1,
                maxWidth: 1000,
              },
              children: title,
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "4px solid #5dcdf1",
                paddingTop: 24,
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: {
                      fontFamily: "Fraunces",
                      fontWeight: 600,
                      fontSize: 40,
                    },
                    children: config.site.author,
                  },
                },
                {
                  type: "span",
                  props: {
                    style: { fontSize: 17, color: "#1b1624" },
                    children: tr("Ideas on technology, creativity, and life."),
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Arimo", data: sans, weight: 400, style: "normal" },
        { name: "Fraunces", data: serif, weight: 600, style: "normal" },
        ...(cjk
          ? [
              {
                name: "Noto Sans SC",
                data: cjk,
                weight: 500 as const,
                style: "normal" as const,
              },
            ]
          : []),
      ],
    }
  );
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png" },
  });
}
