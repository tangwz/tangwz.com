import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import { indexableSitemap } from "./src/utils/indexableSitemap";
import { buildMetadata } from "./src/utils/buildMetadata";
import { unified } from "@astrojs/markdown-remark";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import rehypeCallouts from "rehype-callouts";
import remarkMath from "remark-math";
import { rehypeMath } from "./src/utils/rehypeMath";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import { rehypeLocalizedFootnotes } from "./src/utils/rehypeLocalizedFootnotes";
import config from "./astro-paper.config";

export default defineConfig({
  site: config.site.url,
  devToolbar: { enabled: false },
  integrations: [mdx(), indexableSitemap(), buildMetadata()],
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "zh",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    syntaxHighlight: { type: "shiki", excludeLangs: ["math"] },
    processor: unified({
      remarkPlugins: [
        remarkMath,
        remarkToc,
        [remarkCollapse, { test: "Table of contents" }],
      ],
      rehypePlugins: [rehypeCallouts, rehypeLocalizedFootnotes, rehypeMath],
    }),
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      name: "Noto Sans SC",
      cssVariable: "--font-og-cjk",
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/noto-sans-sc-medium.ttf"],
            weight: 500,
            style: "normal",
          },
        ],
      },
    },
    {
      name: "Arimo",
      cssVariable: "--font-arimo",
      provider: fontProviders.local(),
      fallbacks: ["Arial", "sans-serif"],
      options: {
        variants: [
          {
            src: [
              "./src/assets/fonts/arimo-400.woff2",
              "./src/assets/fonts/arimo-regular.ttf",
            ],
            weight: 400,
            style: "normal",
          },
          {
            src: ["./src/assets/fonts/arimo-500.woff2"],
            weight: 500,
            style: "normal",
          },
          {
            src: ["./src/assets/fonts/arimo-600.woff2"],
            weight: 600,
            style: "normal",
          },
          {
            src: ["./src/assets/fonts/arimo-700.woff2"],
            weight: 700,
            style: "normal",
          },
        ],
      },
    },
    {
      name: "Fraunces",
      cssVariable: "--font-fraunces",
      provider: fontProviders.local(),
      fallbacks: ["serif"],
      options: {
        variants: [
          {
            src: [
              "./src/assets/fonts/fraunces-semibold.woff2",
              "./src/assets/fonts/fraunces-semibold.ttf",
            ],
            weight: 600,
            style: "normal",
          },
        ],
      },
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});
