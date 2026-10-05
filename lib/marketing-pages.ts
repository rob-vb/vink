/**
 * Every indexable marketing page, by its English path. The sitemap lists each
 * in both languages. Privacy and Terms join once their real text replaces the
 * placeholders (they are noindex until then). /app is never listed.
 */
export const indexedPages = ["/", "/features", "/pricing", "/developers", "/contact"] as const;
