# The marketing site lives at `/`, the product at `/app`, with locale rewrites in the Next config

The public site and the product share one Next.js project and one domain. The product moved under `app/app/…` (served at `/app/*`) with its own root layout, which reads the auth token and is dynamic. The marketing site is `app/(marketing)/[locale]/…` with a second, static root layout (`dynamic = "error"` guards it). There is no top-level root layout, so `app/global-not-found.tsx` serves unmatched URLs. Old product URLs (`/sign-in`, `/sign-up`, `/welcome`, `/invite/*`, `/o/*`) redirect permanently to `/app/…`.

English has no prefix and Dutch lives at `/nl`. next-intl 4 handles messages and locale-aware links, and reads the locale from `next/root-params`. The prefixing is done by **rewrites and redirects in `next.config.ts`**, not by next-intl's proxy (`proxy.ts`) as first planned: `/x` is rewritten to the prerendered `/en/x`, and `/en/x` redirects to `/x`. There is no browser-language detection; the language switcher writes its own year-long `NEXT_LOCALE` cookie.

We dropped the proxy because its rewrite loops on this VPS. `next start -H 127.0.0.1` resolves routes against `http://127.0.0.1:<port>`, while the proxy sees the request as `localhost` (and as `https` behind nginx's `X-Forwarded-Proto`). Next then treats the rewrite as external, proxies it over HTTP to itself, and the proxy redirects the `/en` path back to `/`. Config rewrites are resolved internally, so they don't depend on the host.

## Consequences

- Marketing pages stay fully static: they must never read cookies or headers. "Log in" versus "Open app" is decided client-side.
- The product's `/app` responses carry `X-Robots-Tag: noindex, nofollow`; robots.txt doesn't disallow `/app/`, so crawlers can see the header.
- The smoke test (`npm run smoke`) builds into `.next-smoke`, never into the `.next` that prod serves from the same folder.
