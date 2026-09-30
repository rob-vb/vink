import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { indexedPages } from "@/lib/marketing-pages";
import { languageAlternates, localeUrl } from "@/lib/seo";

// Both languages of every marketing page, each with its en/nl/x-default
// alternates, all from SITE_URL. Nothing under /app.
export default function sitemap(): MetadataRoute.Sitemap {
  return indexedPages.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localeUrl(locale, path),
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1 : 0.7,
      alternates: { languages: languageAlternates(path) },
    })),
  );
}
