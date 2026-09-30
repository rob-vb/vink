# Routing and i18n on Next 16

Type: research
Status: resolved
Blocked by: 

## Question

How do we, on this repo's Next.js 16 (read `node_modules/next/dist/docs/`), serve a statically rendered marketing site at `/` (English) and `/nl/...` (Dutch) next to the product under `/app/*`? Cover: which i18n library fits Next 16 and can later be reused by the app (next-intl or alternatives), locale prefix only for `nl`, a language cookie without auto-redirect, `proxy.ts`/middleware implications, `hreflang` and sitemap, and what moving the product to `/app` touches — the `(auth)` pages, the `/` redirect in `app/page.tsx`, Better Auth `SITE_URL`/callbacks in `convex/auth.ts`, invite links in `convex/invitations.ts`, hard-coded `/o/${slug}` and `/sign-in` paths, and a redirect from old `/invite/*` links. Output: a recommended setup and a list of every place that changes.

## Answer

Two root layouts and no top-level `app/layout.tsx`: the marketing site in `app/(marketing)/[locale]/…` with `<html lang={locale}>`, the product in `app/app/…` with today's root layout moved there unchanged. This is required: today's root layout calls `getToken()`, which reads cookies and makes every page dynamic. `/api/auth` stays put.

Use **next-intl 4.14.x**: actively released, supports Next 16, uses `proxy.ts`, reads the locale via Next 16.3's `next/root-params`. next-international is unmaintained; paraglide-next is gone from npm.

- **Routing:** `localePrefix: 'as-needed'`, `localeDetection: false`. `proxy.ts` rewrites `/x` to internal `/en/x` and redirects `/en/x` to `/x`; no browser-language redirect. Matcher skips `/app`, `/api` and files.
- **Language cookie:** `localeCookie: false` (the default overwrites on every view and is session-only). The switcher writes `NEXT_LOCALE` for one year on path `/`, readable by the app later.
- **SEO:** per-page hreflang for en, nl and x-default; `app/sitemap.ts` lists both languages. Next needs its own `SITE_URL` (today only Convex has one).
- **Old links:** permanent redirects in `next.config.ts` for `/invite/*`, `/sign-in`, `/sign-up`, `/welcome`, `/o/*`.
- **"Open app":** resolved client-side so marketing stays static; always links to `/app`.
- **Two root layouts** need `global-not-found.tsx` (experimental flag).
- **Code that changes:** 17 `PageProps`/`LayoutProps` route strings; sign-in/sign-up `callbackURL: "/"` (else magic links land on marketing); the `invitePath` regex; five redirects; ~30 hard-coded `/o/${slug}` links in 16 files; the invite URL at `convex/invitations.ts:78` and its test regex.
- **Unchanged:** Better Auth `baseURL`/`trustedOrigins`, nginx, pm2.
- **Before moving files:** commit the pending logo work on main.

Nothing was built or run; the findings file ends with open checks for the build ticket.

Findings: branch `research/routing-and-i18n`, file `.scratch/vink-marketing/research/routing-and-i18n.md`.
