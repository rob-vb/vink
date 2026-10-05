# SEO and sharing basics on Next 16

Type: research
Status: resolved
Blocked by: 

## Question

How do we do per-page, per-language metadata and sharing on this repo's Next.js 16 with next-intl 4 (read `node_modules/next/dist/docs/`)? Cover: the Metadata API with `generateMetadata` per locale (title template, description, canonical, `alternates.languages` alongside the settled hreflang/sitemap), OG and Twitter images (`opengraph-image.tsx` / `ImageResponse` per page and language vs static images, fonts incl. Geist), `robots.ts` keeping `/app/*` out of the index, JSON-LD worth adding (Organization, SoftwareApplication with Offers, FAQPage — and whether Google still shows FAQ rich results), and `llms.txt` / AI-SEO basics that are worth doing for a small site. Output: a recommended setup and a per-page metadata checklist.

## Answer

- **One helper for every page.** `pageMetadata({ locale, path, ns })` returns the localized title and description, `alternates.canonical` (the page's own localized URL), `alternates.languages` (en, nl, x-default → EN) and `openGraph` (`type`, `siteName`, `url`, `locale`, `alternateLocale`). Every page's `generateMetadata` calls it.
- **Marketing root layout defaults.** It sets `metadataBase` from `SITE_URL`, `title.template '%s · Vink'` and `twitter.card`. It must not set og title, description or images: metadata merges shallowly, so pages would inherit the layout's values. Home uses `title.absolute`, because the template only applies to child segments.
- **hreflang.** Set next-intl `alternateLinks: false`. hreflang then comes only from metadata and `sitemap.ts`, both built from `SITE_URL`. next-intl's `Link` header would use the request host instead, which breaks during the domain change.
- **OG images.** Generate them with `opengraph-image.tsx` and one shared `<OgCard>`: white card, navy Geist headline, logo.
  - Home, Features, Pricing, Developers and Security each get their own card, in both languages via `params.locale`. Privacy, Terms and Contact inherit Home's card.
  - Localized alt text needs `generateImageMetadata`.
  - Geist Regular is already the default `next/og` font. Commit `Geist-SemiBold.ttf` for the headline: next/font's woff2 is unsupported, and the limit is 500 KB.
  - No `twitter-image` files: X falls back to the OG tags.
- **Proxy matcher.** Add `.*/opengraph-image` to ticket 04's matcher. The OG URLs carry `/en/` and have no dot.
- **Keeping `/app/*` out of Google.** Send an `X-Robots-Tag: noindex, nofollow` header from `next.config` headers, and set `robots: { index: false }` in the app root layout. robots.txt disallows only `/api/`. **Do not disallow `/app/`**: Google cannot see a noindex on a URL it may not crawl. This corrects ticket 04.
- **JSON-LD.**
  - Home: Organization + WebSite.
  - Pricing: SoftwareApplication with one Offer per plan (EUR, excl. VAT), built from the plan data. It gives no rich result: Google requires ratings, and we won't fake them.
  - FAQPage is optional. Google stopped showing FAQ rich results for everyone on 7 May 2026.
- **AI-SEO.** Google says llms.txt and special schema aren't needed. A small English `app/llms.txt/route.ts` (facts, prices, links) is worth ~20 minutes — **included** (2026-09-30). The real lever is static HTML with prices and FAQ as text. Submit the sitemap to Search Console (DNS domain property) and Bing.
- **Per-page checklist** (EN and NL): localized title (~50–60 chars) and unique description (~140–160 chars); own canonical; the three hreflang entries; og url and locale; OG card or inherited card; sitemap entry with alternates; one `<h1>`. Pricing adds Offers JSON-LD and Home adds Organization/WebSite. `/app/*` gets noindex and stays out of the sitemap.

Nothing was built. The findings end with open checks: build output, view-source and curl checks, and share debuggers.

Full findings: branch `research/seo-and-sharing-basics`, file `.scratch/vink-marketing/research/seo-and-sharing-basics.md`.
