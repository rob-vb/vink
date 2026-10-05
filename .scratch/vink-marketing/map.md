# Vink marketing site — map

Label: wayfinder:map

## Destination

A build-ready spec at `.scratch/vink-marketing/spec.md` for a public marketing site for Vink on `vink.page/`, with the product moved to `/app/*`. The goal of the site is self-serve sign-up. When no tickets remain, write the spec with `/to-spec`; building happens afterwards through normal tickets.

## Notes

- We talk Dutch; code, tickets and the site's default language are English. Product vocabulary lives in `CONTEXT.md` (Form, Field, Document, Needs Review, Approval, Payload, Integration…). Marketing copy may use plainer customer language, but must not contradict those terms.
- Settled while charting:
  - One Next.js project: a `(marketing)` route group on `/`, the whole product under `/app/*` (including sign-in, sign-up, invite and welcome). `/api/auth` stays where it is. Old `/invite/*` links redirect to `/app/invite/*`.
  - Conversion goal: **self-serve account creation** ("Start free" / "Create account"), with "Log in" for existing users. A logged-in visitor on `/` sees the marketing site with "Open app" instead of "Log in"; no redirect.
  - Positioning: Vink handles **any document**. That is the point. **Never feature tyre reports** (or any single niche) as the hero or lead example.
  - Main audience: operations and admin teams; developers get their own page, which also offers a paid integration service by Vink.
  - Pages v1: Home, Features, Pricing, Developers, Security & privacy, Privacy policy, Terms, Contact. No blog or changelog.
  - Features page: per feature a screenshot of the real app plus explanation. A 15-second video showing the app.
  - Demo: a pre-recorded, clickable demo on varied documents. No live upload for anonymous visitors.
  - Content lives in code: TSX plus i18n message files. No CMS.
  - Languages: English at `/`, Dutch at `/nl/...`, with a language switcher in the nav and footer, no auto-redirect, and the choice remembered in a cookie that the app can reuse later.
  - Analytics: Google Analytics 4 on the marketing site (eventually), so cookie consent is needed.
- Skills: UI work goes through the **Mobbin MCP** for patterns and UX first, then **shadcn/ui** for components (also `frontend-design` / `impeccable`). Copy and positioning: `marketing-skills:product-marketing`, `copywriting`. Pricing: `marketing-skills:pricing`. Grilling tickets: `grilling` + `domain-modeling`. Research tickets: `research`.
- The logo was just updated (`components/logo.tsx`, `app/icon.svg`); build on it.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md) — gist -->

- [Marketing-site patterns on Mobbin](issues/01-marketing-site-patterns.md) — Mobbin has no Rossum/Docsumo/Nanonets pages; Reducto, V7 Go, Sequence and strong B2B sites (Retool, Customer.io, Linear, Tines) are the references. Reusable: an input → reading → your-systems hero, human review up front, value-links-to-source, 4-step how-it-works with real screen crops, a plain-facts trust row (EU-hosted, 30-day retention) instead of badges, a real JSON Payload under a `POST` bar, a lean nav with one primary CTA, and a documents-per-month pricing slider. Avoid badge walls, abstract heroes, a chat box as hero, equal-weight CTAs and unexplained accuracy percentages.
- [Competitor pricing and our cost per page](issues/02-competitor-pricing-and-unit-cost.md) — Competitors meter per page: dev APIs $0.01–0.06, review-UI apps more (Parseur €49/100 pages) or quote-only. Vink costs ~$0.02/page now, ~$0.035 from 2027 (Gemini price doubles), so ~€0.07–0.10/page keeps ≥70% margin. Free tier is cheap; its size is an abuse question.
- [Routing and i18n on Next 16](issues/04-routing-and-i18n.md) — Two root layouts: `app/(marketing)/[locale]` (static) and `app/app/…` (today's layout). next-intl 4.14 with `as-needed` prefix, no detection, own one-year `NEXT_LOCALE` cookie. Permanent redirects for old product paths; ~30 hard-coded `/o/` links, auth `callbackURL`s and the invite URL change. Commit the logo work first.
- [GA4 and cookie consent in the EU](issues/05-ga4-and-cookie-consent.md) — GA4 needs prior consent (AP never cleared it as low-impact). Consent Mode v2 basic, ads off; our own shadcn banner with equal Accept/Reject, footer "Cookie settings", 6-month first-party cookie read client-side; gtag only in the marketing root layout so `/app` stays GA-free.
- [Plans and pricing model](issues/03-plans-and-pricing-model.md) — Metered per Page, same features and unlimited users on every plan, EUR excl. VAT, annual −20%. Free 20 Pages once (first Organisation only), Starter €49/300, Team €89/1,000, Business €199/3,000, Custom from €500/month; refuse at upload when out, €10/100-page top-ups. App enforces plans and quota now; Upgrade goes to Contact until billing. Pricing page: three cards plus a Custom band, "what counts as a page", FAQ.
- [Positioning and messaging](issues/06-positioning-and-messaging.md) — Hero "Document. Vink. Done." for any PDF incl. handwriting, enemy is retyping; four pillars (any PDF, check only what's unsure, straight into your systems, data kept short: "Stored in the EU", not EU-only, because Jev is US); no "AI" in visible copy, no accuracy numbers or competitor names; "Start free" + 20 free pages; team block as proof; integration service paid, introduced on Home. Full context in `.agents/product-marketing.md`.
- [Visual direction and homepage layout](issues/07-visual-direction-and-homepage.md) — A's look (Geist, white/navy, shadcn), light by default with a dark switch. Order: hero with the review screen → trust row → 15 s video → "What happens to one document" (4 stops, document tabs at stop 2) → "Two ways to connect it" → data kept short → pricing row → team block + FAQ → closing card.
- [Interactive demo](issues/08-interactive-demo.md) — On Features (Home links to it): an exact replica of the app's Documents table and review screen with five hand-filled demo documents (invoice, 2-page delivery note, handwritten form, faxed order, Auto-Send receipt). Approve shows the outcome as values, no JSON (that's for Developers); an empty Needs Review ends in Start free. The demo changes whenever the app's table or review screen does.
- [Developers page and integration service](issues/09-developers-page-and-integration-service.md) — One `/developers` page (NL too) documenting today's envelope, retries, test-send and signature with Node/Python/PHP snippets; signature becomes `t=…,v1=…` over `t.body` before launch; honest "no upload API yet, tell us". Integration service: one-off build, "From €950 per connection"; request form (shared with Contact) emails Vink via Resend, not stored, honeypot + rate limit.
- [Free Pages abuse and sign-up checks](issues/10-free-pages-abuse-and-sign-up.md) — Light defences (~€0.60 per farmed account): password sign-ups verify email before sign-in, disposable domains blocked, free-mail allowed with no bonus, Better Auth rate limits (per IP + per email), honeypot not captcha, form unchanged plus a Terms/Privacy line, Vink emailed per new Organisation; Free Pages can be zeroed Free Pages by hand.
- [SEO and sharing basics on Next 16](issues/14-seo-and-sharing-basics.md) — One `pageMetadata` helper per page (localized title/description, own canonical, en/nl/x-default hreflang, og url/locale) with `metadataBase` from `SITE_URL` and next-intl `alternateLinks: false`; generated Geist OG cards per page and language (matcher skips `.*/opengraph-image`); `/app/*` kept out via `X-Robots-Tag` noindex, not a robots.txt disallow; JSON-LD Organization/WebSite on Home and SoftwareApplication + Offers on Pricing (no rich results; FAQ rich results ended May 2026); small `llms.txt` optional.
- [Email-in and cloud-storage intake: feasibility and cost](issues/15-email-and-storage-intake-feasibility.md) — Launch with email-in only: Cloudflare Email Routing + Worker (free routing, $5/mo Workers, 25 MiB, PDFs straight to our EU R2, DMARC failures rejected) at `<token>@<intake-domain>` on a Cloudflare apex that never moves (catch-all is apex-only), so the domain move leaves addresses intact; Resend inbound stores data in the US (stopgap at most), SES Frankfurt is the EU-strict fallback. Folder-watch later: Dropbox App folder, then OneDrive (`Files.Read`, free publisher verification; SharePoint needs admin consent); Google Drive needs restricted `drive.readonly` + annual CASA (~$540–5,400/yr, weeks); iCloud has no API.
- [Security & privacy page content](issues/13-security-and-privacy-page.md) — Plain summary on top (trust row), then 8 checkable sections incl. a subprocessor table (Hetzner, Convex, R2, Vertex EU; TypeSafe and Resend US, TypeSafe "may keep logs"), "What we don't have yet" (no SOC 2/ISO/2FA, DPA on request), security@ + security.txt. Auto-Send explained, account closing by email. Spec gains: Admin "Delete now" for any Document, retention fixes (failed-delivery gap, max 365 days, wipe response bodies, orphan uploads), test-send limited to approved/example data, HSTS + security headers. Pre-launch: set prod `RESEND_API_KEY`, take the Claude bridge offline.
- [Volume intake at launch](issues/11-volume-intake-gaps.md) — Launch intake is multi-file upload (one Form, per-file rows and errors) plus email-in on a per-Form Intake Address (Cloudflare Worker; Admins replace; no replies; "Recent emails" list of refusals; out-of-Pages refused plus a daily Admin email). The permanent intake domain is a pre-launch purchase, so the build runs on a test domain. Copy: "Upload it or email it in" on Home, a Features section, a Pricing FAQ, a Developers line; PDFs up to 20 pages.
- [Features page content](issues/12-features-page-content.md) — Variant C "Chapters": hero → 15 s video (repeated, big) → four stop chapters, each a feature picker (list + one screenshot) → the demo right after "You check" → "Around it" bento (team, data kept short, pricing) → closing card. Nine features: upload/email, any PDF, your fields, value to source, Needs Review, Approval & Auto-Send, Integrations, team, data. Real screenshots with demo data, light mode only.

## Not yet specified

<!-- empty: all fog graduated and resolved; the map is ready for /to-spec -->

## Out of scope

- Moving to a new domain (vink.nl or similar): a separate cutover. Keep all absolute URLs behind config (`SITE_URL`) so that cutover stays cheap.
- Translating the app itself to Dutch: a separate effort; this map only makes sure the language cookie can be reused.
- Writing the legal texts (privacy policy, terms, DPA): part of the GDPR pre-launch track; this map only reserves the pages.
- Blog and changelog.
- Stripe billing — checkout, subscriptions, Stripe Tax, annual billing, buying top-ups, invoices: a separate effort. Until then we set plans by hand ([Plans and pricing model](issues/03-plans-and-pricing-model.md)).
- Upload API (`POST /documents`): a separate effort once someone asks; Developers says "no upload API yet, tell us" ([Volume intake at launch](issues/11-volume-intake-gaps.md)).
- Cloud-storage connectors (Dropbox, OneDrive, SharePoint, Google Drive): a later effort, not mentioned on the site ([Email-in and cloud-storage intake](issues/15-email-and-storage-intake-feasibility.md) holds the order).
- Halving cost per page with Vertex Flex/Batch: a pipeline decision, not a marketing-site one.
