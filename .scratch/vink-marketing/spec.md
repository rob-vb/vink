# Vink marketing site — spec

Status: ready-for-agent

Synthesised from the [Vink marketing map](map.md), its 15 resolved tickets, `CONTEXT.md`, `.agents/product-marketing.md` and ADRs 0001–0003. Terms in **bold** come from `CONTEXT.md`. Where this spec and a ticket differ, the later ticket wins, and the spec already reflects that. Examples: Security replaces Plans' "EU hosting" with "Stored in the EU", and SEO overrides Routing's robots.txt disallow.

## Problem Statement

Vink works, but only people Rob sends a link to can reach it. The domain opens straight onto the product's sign-in. An operations or admin team that retypes invoices, delivery notes, order forms and handwritten forms has nowhere to learn what Vink does or whether it reads their messy documents. They can't see what it costs, whether their data leaves the EU, or how the data gets into their own system. They can't try it without talking to someone either.

Several things in the app also stand in the way of letting strangers in:
- Nothing limits how much an Organisation may read, so self-serve sign-up would be an open tab on Rob's Vertex bill.
- Sign-up has no email verification and no rate limits.
- Documents arrive one PDF at a time, too slow for a team on 1,000–3,000 Pages a month.
- A developer can't find out how the Payload is shaped or signed, and the current signature can be replayed.
- A few of the claims a security page would make aren't fully true yet: retention has a gap, and only Rejected Documents can be deleted early.

## Solution

A public marketing site on the current domain, built in the same Next.js project. English lives at `/` and Dutch at `/nl/…`, and the whole product moves to `/app/*`. The site has one goal: self-serve sign-up via **"Start free"**, which gives 20 **Free Pages** with no credit card.

The site says Vink handles **any PDF**, typed, scanned or handwritten, and never leads with one niche. The hero is "Document. Vink. Done." Four pillars follow:
1. Any PDF, even handwriting.
2. You only check what's unsure.
3. Straight into your systems.
4. Your data, kept short.

The site shows the real product rather than claims: real screenshots, a 15-second video, a clickable demo that is an exact copy of the app's Documents table and review screen, and a real Payload. Pages v1: Home, Features, Pricing, Developers, Security & privacy, Contact, Privacy policy and Terms.

To make self-serve safe and credible, the app gains:
- **Plans** metered in **Pages**, with a quota that refuses uploads once the Pages run out. Rob sets Plans by hand until billing exists.
- Email verification, rate limits and a disposable-domain block at sign-up.
- Multi-file upload and a per-Form **Intake Address** for email-in.
- A timestamped webhook signature.
- "Delete now" for any Document, plus the retention and security fixes the Security page depends on.

## User Stories

### Finding and understanding Vink

1. As an ops lead who retypes documents, I want the homepage to tell me in one line what Vink does, so that I know within seconds whether it's for me.
2. As a visitor, I want to see the real review screen in the hero, so that I believe the product exists and looks usable.
3. As a visitor, I want a plain trust row under the hero ("Stored in the EU · Deleted 30 days after sending · Nothing sent without your approval"), so that my first privacy worry is answered straight away.
4. As a visitor, I want a 15-second video right after the hero, so that I see one PDF go in and clean data come out without reading anything.
5. As a visitor, I want to follow "what happens to one document" in four stops (it arrives, Vink reads it, you check, it lands), so that I understand the whole flow.
6. As a visitor with varied paperwork, I want document tabs (invoice, delivery note, handwritten form, order form) showing Fields and "Read on page N", so that I see Vink isn't limited to one kind of document.
7. As a visitor without a developer, I want to see that Rob can connect Vink to our system for a fixed price, so that a missing developer doesn't stop me.
8. As a visitor with a developer, I want to see a real JSON Payload under a `POST` bar, so that I know the integration is ordinary.
9. As a visitor, I want a pricing row on Home with Starter, Team, Business and Custom, so that I learn the cost before I dig deeper.
10. As a visitor, I want to see who is behind Vink, with a photo and a direct email, so that I trust a small company without customer logos.
11. As a visitor, I want a five-question FAQ on Home (wrong reads, messy or handwritten documents, no developer, where the data goes, templates), so that my main objections are answered before I sign up.
12. As a visitor, I want a closing card "Stop retyping. Start with 20 pages." with "Already a customer? Log in", so that the last step is obvious either way.
13. As a visitor, I want a lean nav (Features, Pricing, Developers, Security, a quiet Log in and one "Start free"), so that I'm never unsure what to click.
14. As a visitor, I never want to see "AI", accuracy percentages or competitor names in the copy, so that the site reads as calm and honest.

### Features and the demo

15. As a visitor, I want a Features page that walks the same four stops as chapters, so that I can go deeper on the part I care about.
16. As a visitor, I want each chapter to have a feature picker (a list on the left, one real screenshot on the right), so that I see the actual screen for each feature.
17. As a visitor, I want to read how documents get in (multi-file upload, a per-Form email address, PDFs up to 20 pages, "Other sources? Tell us."), so that I know whether Vink fits our volume.
18. As a visitor, I want to see that Fields are mine, not a template, and can be proposed from one sample PDF, so that setup doesn't sound like a project.
19. As a visitor, I want to see that every value shows where it was read and how confident Vink is, so that I trust what I'm checking.
20. As a visitor, I want to see that only flagged values need checking and that nothing goes out without approval (Auto-Send off by default), so that I know I stay in control.
21. As a visitor, I want to try a clickable demo that looks exactly like the app, so that I know what I'd really be using.
22. As a demo user, I want to open a Document from the Documents table, click a value and see the PDF turn to the page it was read on, so that I feel the check workflow.
23. As a demo user, I want to correct a value, mark a value as right, undo, and approve once nothing is flagged, so that I experience a real review.
24. As a demo user, I want approving to return me to the table with a toast and move the Document to Approved, so that the flow feels finished.
25. As a demo user, I want to open an approved Document and see "Sent to your system · Delivered" with the final values, so that I understand the outcome without reading JSON.
26. As a demo user, I want to see a receipt that was approved through Auto-Send, so that I understand hands-off processing.
27. As a demo user who has cleared Needs Review, I want a card with my time and the values checked and read, then "Start free", so that the natural next step is signing up.
28. As a demo user, I want "Look around" and "Start over", so that I can keep exploring or replay it.
29. As a mobile visitor, I want the demo to work like the app does on mobile (fewer table columns, page above Fields), so that I can try it on my phone.
30. As a visitor, I want a Home link "Try the demo" that jumps to the demo on Features, so that I can try it without hunting.
31. As a visitor, I want an "Around it" section (whole team with no seat count, data kept short, every plan includes everything), so that the remaining questions are answered in one place.

### Pricing

32. As a buyer, I want to be told that every plan includes everything and I only choose how many Pages, so that comparing plans is easy.
33. As a buyer, I want a Monthly / Annual (−20%) toggle, where annual shows the monthly equivalent and "billed annually", so that I can compare both honestly.
34. As a buyer, I want three cards (Starter €49/300, Team €89/1,000 highlighted, Business €199/3,000) with the per-page price in small type and who each is for, so that I can pick quickly.
35. As a buyer, I want every price shown in EUR excl. VAT with "+ VAT where applicable", so that there are no surprises.
36. As a buyer, I want every card's button to be "Start free", going to sign-up, so that I can try before paying.
37. As a larger buyer, I want a Custom band (more than 3,000 Pages, a DPA, payment by invoice, from €500/month) with "Talk to us", so that I know there's a route for us.
38. As a buyer, I want to know what counts as a Page, with examples (a 1–2 page invoice, a 1 page delivery note, a 10 page contract), and that retries are free, so that I can estimate my volume.
39. As a buyer, I want an FAQ covering per-user cost, what a Page is, running out and Top-ups, roll-over, VAT, cancelling, where data lives and how documents get in, so that I don't have to email to find out.

### Developers and the integration service

40. As a developer, I want one Developers page with anchor sections (Overview, Envelope, Verify the signature, Delivery and retries, Test-send, Integration service), so that I can build a receiver without a docs site.
41. As a developer, I want an annotated envelope example built from a demo Form, with the rules "every key is always present, `null` means no value, `[]` means an empty List", so that my parser handles every case.
42. As a developer, I want signature-verification snippets in Node, Python and PHP, each with a constant-time compare and a timestamp check, so that I can verify requests correctly first time.
43. As a developer, I want the delivery rules documented (15 s timeout, which responses retry, the backoff schedule, `Retry-After`, at-least-once, deduplicate on `deliveryId`), so that my receiver behaves well.
44. As a developer, I want to know about custom headers and test-send (`test: true`, never a Delivery), so that I can secure and test my endpoint.
45. As a developer, I want an honest line that there is no upload API yet, with "tell us" and the email-in alternative, so that I know what's possible today.
46. As a developer or IT reviewer, I want one factual line on how reading happens ("reads with Gemini on Vertex AI, EU region"), so that I can assess it.
47. As a business owner without a developer, I want to read what the integration service includes, what it costs ("From €950 per connection, excl. VAT") and what I'd need to provide, so that I can decide to ask.
48. As a prospect, I want a short request form (name, work email, company, target system, documents, rough Pages per month, optional note), so that Rob has what he needs to reply.
49. As a Dutch developer, I want `/nl/developers` with Dutch prose but code, keys and header names in English, so that it reads naturally and matches the real API.

### Security & privacy

50. As an IT or procurement reviewer, I want a plain summary on top and eight checkable sections below, so that both my manager and I get what we need.
51. As a reviewer, I want to know exactly where data lives (app in Finland, database in Ireland, PDFs in Cloudflare R2 EU, reading on Vertex AI EU), so that I can judge residency.
52. As a reviewer, I want a subprocessor table (name, purpose, region, data), including the US ones (TypeSafe/Jev, Resend), so that I see the full picture and not only the flattering part.
53. As a reviewer, I want the retention rules spelled out (30 days after sending by default, 1–365 days configurable, 90 days if never approved, Rejected after 30 days, Form Proposals after 7), and what stays after deletion, so that I can map them to our policy.
54. As a reviewer, I want to read how access is controlled (Organisation isolation checked on every request, Admin vs Member, sign-in methods and session length), so that I can assess the risk.
55. As a reviewer, I want to read about transport and at-rest protection (HTTPS with HSTS, short-lived PDF links, encrypted Integration secrets, signed Payloads), so that I can tick those boxes.
56. As a reviewer, I want an honest "What we don't have yet" (no SOC 2/ISO, no 2FA/SSO, DPA on request), so that I trust the rest of the page.
57. As a security researcher, I want a `security@` address and a `/.well-known/security.txt`, so that I know where to report problems.

### Contact, legal and language

58. As a visitor, I want a Contact page with the same form (fewer fields) and the founder block, so that I can ask anything.
59. As a visitor who submits a form, I want a clear confirmation and a reply from a real person to my own email, so that I know it arrived.
60. As a visitor, I want Privacy policy and Terms pages linked from the footer and from sign-up, so that I can read what I agree to.
61. As a Dutch visitor, I want the whole site in Dutch at `/nl/…`, with a language switcher in the nav and footer, so that I can read it in my own language.
62. As a visitor, I want my language choice remembered and never to be redirected based on my browser, so that I stay in control of the language.
63. As a visitor, I want to switch between light and dark, with light as the default, so that the site suits my preference.
64. As a visitor sharing a link, I want a proper preview card with the page's title in the right language, so that the link looks trustworthy.

### Analytics and consent

65. As a visitor, I want a cookie banner with equal "Accept" and "Reject" buttons that names the purpose (statistics) and the one third party (Google), so that I can make a real choice.
66. As a visitor who rejects cookies, I want no Google tag to load at all, so that my choice is respected.
67. As a visitor, I want a permanent "Cookie settings" link in the footer, so that I can change my mind.
68. As Rob, I want GA4 measuring marketing pages and clicks on "Start free", so that I know which pages lead to sign-ups.
69. As a Vink user, I want the app under `/app` to be completely free of Google Analytics, so that my work isn't tracked.

### Sign-up and access

70. As a visitor, I want "Start free" to go straight to account creation, so that I can try Vink without a sales call.
71. As a visitor, I want the sign-up form unchanged (Organisation name, email, then a password or a magic link), with a line that I agree to the Terms and Privacy policy, so that it stays quick.
72. As a password sign-up, I want to verify my email before I can sign in, so that nobody can claim my address.
73. As someone using a disposable email address, I want a plain message that it isn't accepted, so that I know to use a real one.
74. As Rob, I want sign-up, password sign-in and magic-link sending rate-limited per IP and per email, so that bots can't farm Free Pages or spam addresses.
75. As Rob, I want a honeypot field on sign-up, so that simple bots are stopped without a captcha.
76. As Rob, I want an email for every new Organisation (with the email domain), so that I can spot abuse and follow up with sales.
77. As an existing user, I want "Log in" on the site to take me to the app, and "Open app" instead when I'm already signed in, so that I get to my work in one click.
78. As an existing user, I want my old bookmarks (`/o/…`, `/sign-in`, `/sign-up`, `/welcome`) and old invitation links (`/invite/…`) to still work, so that the move to `/app` doesn't break anything.
79. As an invited user, I want new invitation emails to point to `/app/invite/…`, so that I land in the app and not on the marketing site.
80. As a magic-link user, I want the link to bring me back into the app, never onto the marketing homepage, so that signing in just works.

### Pages, Plans and quota

81. As the first Organisation a user creates, I want 20 Free Pages with no card and no expiry, so that I can try Vink on my own documents.
82. As a user who creates a second Organisation, or who was invited, I want to understand that there are no extra Free Pages, so that the rules are clear.
83. As an Admin, I want to see how many Pages my Organisation has left and when they reset, so that I'm never surprised.
84. As an Admin, I want a warning once 80% of our Pages are used, so that I can upgrade in time.
85. As a Member uploading a PDF that doesn't fit the remaining Pages, I want a clear refusal ("You have 3 pages left; this PDF has 8") with an Upgrade button, so that I know why and what to do.
86. As a user whose Pages ran out, I want everything already uploaded to keep working (review, Approval, Delivery), so that no work in progress is lost.
87. As an Admin, I want a Page to count once, when Vink accepts the PDF, and never again for a retry, a move to another Form or a sample becoming the first Document, so that I only pay for real reading.
88. As an Admin, I want "Upgrade" to take me to Contact until online billing exists, so that I can still get a Plan.
89. As Rob, I want to set an Organisation's Plan, Page allowance and reset date by hand, add Top-ups, and set Free Pages to zero, so that I can run billing manually and stop abuse.
90. As Rob, I want the existing test Organisations (including the prod test account and the Claude bridge) on an internal unlimited Plan that never shows on the site, so that nothing I rely on breaks.

### Getting documents in

91. As a Member, I want to drop several PDFs into the upload dialog at once for one Form, so that a stack of documents takes one action.
92. As a Member, I want each file to have its own row with progress and its own error (over 20 pages, out of Pages, not a PDF), so that one bad file never blocks the rest.
93. As an Admin, I want to switch on an Intake Address per Form, so that suppliers or our own systems can email documents straight in.
94. As any Member, I want to see and copy a Form's Intake Address, so that I can hand it to whoever sends us documents.
95. As an Admin, I want to replace an Intake Address, with the old one stopping at once, so that a leaked address can be killed.
96. As a Member, I want each PDF attached to an email to become its own Document of that Form, so that email-in works like upload.
97. As a Member, I want a "Recent emails" list (the last 50, with sender, time and per attachment "Document created" or why it was refused), so that I can see what happened to an email without Vink ever replying to the sender.
98. As an Admin, I want at most one email a day when emails to a Form are being refused for lack of Pages, with a link to upgrade, so that I notice without being spammed.
99. As a sender, I want spoofed or DMARC-failing mail to be rejected, so that nobody can inject documents by pretending to be me.

### Data, deletion and safety in the app

100. As an Admin, I want to delete any Document now, including Approved ones, after a confirmation, so that I can honour a deletion request immediately.
101. As an Admin deleting a Document with pending retries, I want those retries cancelled, so that deleted data is never sent afterwards.
102. As an Admin, I want the retention setting to go from 1 to 365 days, so that data is never kept longer than the site promises.
103. As an Admin whose Deliveries all failed, I want retention to start at the last attempt, so that data isn't kept forever by accident.
104. As an Admin, I want the receiver's response bodies wiped when a Document is deleted, so that no document data survives in delivery logs.
105. As Rob, I want PDFs that were uploaded but never became a Document deleted after 24 hours, so that storage holds no orphaned customer files.
106. As an Admin, I want test-send to only send example values or Approved Documents, so that unchecked data never leaves by accident.
107. As a receiver, I want each webhook signed as `X-Vink-Signature: t=<unix>,v1=<hex>` over `"{t}.{rawBody}"`, so that a captured request can't be replayed after 5 minutes.
108. As a user, I want the site and app served with HSTS and standard security headers, so that the transport claims on the Security page are true.
109. As Rob, I want `/app/*` kept out of search engines, so that sign-in and product URLs never show up in Google.

### SEO and sharing

110. As Rob, I want every marketing page to have a localized title, a unique description, its own canonical URL and en/nl/x-default hreflang, so that both languages rank without competing.
111. As Rob, I want a sitemap listing both languages with alternates, so that search engines find every page.
112. As Rob, I want generated OG cards per page and language, so that shared links look good in both languages.
113. As Rob, I want Organization/WebSite structured data on Home and SoftwareApplication + Offers on Pricing, built from the same plan data the page shows, so that search engines read the prices correctly.
114. As Rob, I want a small `llms.txt` with facts, prices and links, so that AI assistants describe Vink correctly.
115. As Rob, I want every absolute URL built from one `SITE_URL`, so that the later domain move is a config change.

## Implementation Decisions

### Routing, layouts and i18n ([Routing and i18n](issues/04-routing-and-i18n.md))

- **Two root layouts, no top-level root layout.** A `(marketing)` route group with a `[locale]` segment renders the site statically with `<html lang={locale}>`. The product moves under an `app` segment (served at `/app/*`), with today's root layout moved there unchanged. It is dynamic because it reads the auth token. `/api/auth` stays where it is. Two root layouts need `global-not-found` (experimental flag). Read the Next 16 docs in `node_modules/next/dist/docs/` before building.
- **next-intl 4.14.x**, `localePrefix: 'as-needed'` (EN unprefixed, NL at `/nl`), `localeDetection: false`, `localeCookie: false`, `alternateLinks: false`. `proxy.ts` rewrites `/x` → internal `/en/x` and redirects `/en/x` → `/x`. Its matcher skips `/app`, `/api`, files and `.*/opengraph-image`.
- **Language cookie:** the switcher writes `NEXT_LOCALE` for one year on path `/`. There is no auto-redirect. The app may read the cookie later.
- **Messages:** all site copy lives in EN and NL message files, and the page structure in TSX. There is no CMS.
- **Moving the product to `/app`** changes:
  - the route strings in page and layout props;
  - the ~30 hard-coded `/o/${slug}` links;
  - the `/` redirect;
  - sign-in and sign-up `callbackURL` (to `/app`, never `/`);
  - the invite-path matching;
  - the invitation URL built in the backend, and its test.
- **Permanent redirects** in the Next config: `/invite/*`, `/sign-in`, `/sign-up`, `/welcome`, `/o/*` → their `/app/…` equivalents.
- **Unchanged:** Better Auth `baseURL`/`trustedOrigins`, nginx, pm2.
- **"Log in" / "Open app"** is resolved client-side, so marketing stays static, and always links to `/app`.
- **`SITE_URL`** is a new Next-side env var (today only Convex has one). Every absolute URL, canonical, hreflang, sitemap entry, OG URL and `security.txt` line is built from it.
- **Prerequisite:** commit the pending logo work on main before moving files.

### Look and components ([Visual direction](issues/07-visual-direction-and-homepage.md))

- Geist and Geist Mono, white and navy `#0F1E36` (the logo colour), shadcn/ui components. Amber is used only for Needs Review and green only for checked. Built on the current logo mark.
- `next-themes` with `defaultTheme="light"` and `enableSystem={false}`, plus a sun/moon switch in the nav. Screenshots and mock paper documents stay light in dark mode.
- Screenshots sit in a thin browser frame on a light grey panel. The live site uses **real screenshots with demo data** (Kantoor Noord, Hoekstra, Van Dijk, Het Anker…), light mode only, never tyre reports.
- Honesty rules for every visual: review shows "Read on page N" plus the read text, never a highlighted region. Confidence has two decimals, never a percentage.
- Copy voice: clear, calm, precise. No em-dashes, hype, exclamation marks or "AI" in visible copy ("AI" is allowed in meta). Dutch uses *je*. Full messaging context is in `.agents/product-marketing.md`; the final wording comes from [Positioning and messaging](issues/06-positioning-and-messaging.md).

### Pages

- **Nav:** logo, Features, Pricing, Developers, Security; EN/NL, theme switch, Log in (or Open app), "Start free".
- **Footer:** product, company and legal links, Cookie settings, language switch.
- **Home**, in this order:
  1. Hero: "Document. Vink. Done." with the check after "Vink.", subtitle, "Start free" + "Watch 15 seconds", "20 free pages. No credit card.", and the real review screen on the right.
  2. Trust row.
  3. The 15 s video: "One PDF in, clean data out."
  4. "What happens to one document": four stops on a vertical line. Stop 1 is "Upload it or email it in". Stop 2 has the lighter document tabs and a "Try the demo" link to Features. Stop 3 is Needs Review. Stop 4 shows Deliveries.
  5. "Two ways to connect it": your developer (a Payload under a `POST` bar, a link to Developers) next to "We connect it for you" (Rob, a fixed price agreed up front, "Ask about a connection").
  6. "Your data, kept short".
  7. Pricing row.
  8. Founder block + the five-question FAQ.
  9. Closing card.
- **Features** ([Features page content](issues/12-features-page-content.md), variant C "Chapters"):
  1. Hero "Everything between the PDF and your system."
  2. The big video.
  3. Four chapters, each with a feature picker. The **demo** sits full-width right after chapter 3 on a grey band, under an anchor that Home links to.
  4. The "Around it" bento with three cards.
  5. Closing card.

  Nine features, one screenshot each, as listed in that ticket. On mobile the picker stacks and the bento becomes one column.
- **Pricing** ([Plans and pricing model](issues/03-plans-and-pricing-model.md)):
  1. Header with the Monthly/Annual toggle.
  2. Three cards (Team highlighted).
  3. "Start with 20 free pages. No credit card."
  4. Custom band → Contact.
  5. "Every plan includes": unlimited users, all Forms and Fields, review and Approval, Integrations (webhook), **Stored in the EU**, 30-day retention.
  6. "What counts as a page".
  7. Two-column FAQ, including "How do documents get in?".
  8. Closing CTA.

  There is no slider or calculator. Plan data (name, Pages, monthly and annual price) lives in one module that the cards, the Home pricing row, the JSON-LD Offers and `llms.txt` all read.
- **Developers** ([Developers page](issues/09-developers-page-and-integration-service.md)): the anchor sections from the user stories. The envelope example is built from a demo Form, and the snippets are in Node, Python and PHP. It has two app screenshots (the Integration with a test-send result, and a Document's Delivery status showing a retry) and the integration service ("From €950 per connection, excl. VAT"; hosting by Rob on request for a monthly fee; changes billed per job) with the request form.
- **Security & privacy** ([Security & privacy page](issues/13-security-and-privacy-page.md)): the summary plus eight sections in the ticket's order. The subprocessor table has the anchor `#subprocessors`. Only the statements that ticket lists as true (or true once the build items below ship) may appear. Add a Cloudflare Email Routing/Workers row now that email-in ships (region still to confirm). If TypeSafe grants zero retention before launch, drop its "may keep logs" clause.
- **Contact:** the shared request form with fewer fields, plus the founder block.
- **Privacy policy, Terms:** pages and routes are reserved with placeholder content. The legal texts come from the GDPR track.

### Interactive demo ([Interactive demo](issues/08-interactive-demo.md), variant D)

- An exact replica of the app's Documents page (tabs Needs Review / Approved / Failed / Rejected with counts; table Document · Form vN · Pages · Uploaded by · Uploaded) and review screen, inside a "Demo data" app frame. It has **no demo-only additions**.
- Five hand-written demo Documents are stored statically in the site code:
  - an invoice (1 flagged);
  - a 2-page delivery note (2 flagged, one on page 2);
  - a handwritten service request (1);
  - a faxed order form with a list (1);
  - a receipt already Approved with the Auto-Send badge.
- The behaviour follows user stories 22–29. Approved shows "Sent to your system · Delivered" with values and never JSON. An empty Needs Review ends in the stats card with "Start free".
- Where possible, the demo reuses the app's own table and review components fed with static data, so that "the demo mirrors the app" is kept by construction. Wherever it can't, any change to the app's Documents table or review screen updates the demo in the same change. The same rule applies to the Features screenshots.

### Analytics and consent ([GA4 and cookie consent](issues/05-ga4-and-cookie-consent.md))

- Consent Mode v2 **basic**: no Google tag loads before Accept. Ad consent types are permanently denied, and Google signals and ad personalisation are off.
- Our own shadcn banner: one purpose (statistics), and Accept and Reject equal on the first layer. The first layer names the purpose, Google and how to withdraw. No pre-ticked boxes and no cookie wall. The footer has "Cookie settings". EN and NL.
- The choice is stored in one first-party cookie (`Path=/`, 6 months), read client-side so pages stay static. Consent is logged as Google's EU policy requires. GA's `cookie_domain` is the site host.
- gtag is only included in the marketing root layout, so `/app` never loads it. The "Start free" and sign-up CTA clicks are sent as events.

### SEO and sharing ([SEO and sharing basics](issues/14-seo-and-sharing-basics.md))

- **Metadata:** one `pageMetadata({ locale, path, ns })` helper returns the localized title and description, own canonical, en/nl/x-default `alternates.languages`, and OG `type`/`siteName`/`url`/`locale`/`alternateLocale`. Every page's `generateMetadata` calls it.
- **Marketing root layout:** sets `metadataBase` from `SITE_URL`, `title.template '%s · Vink'` and `twitter.card`, but no OG title, description or images. Home uses `title.absolute`.
- **OG cards:** generated with `opengraph-image` and one shared card (white card, navy Geist headline, logo) for Home, Features, Pricing, Developers and Security in both languages. Localized alt text comes from `generateImageMetadata`. Geist SemiBold TTF is committed. Other pages inherit Home's card.
- **Indexing and sitemap:**
  - `/app/*` gets `X-Robots-Tag: noindex, nofollow` from the Next config headers, plus `robots: { index: false }` in the app root layout.
  - robots.txt disallows only `/api/`, never `/app/`.
  - The sitemap lists every marketing page in both languages with alternates.
- **Structured data and extras:**
  - JSON-LD: Organization + WebSite on Home; SoftwareApplication + one Offer per plan (EUR, excl. VAT) on Pricing. No FAQPage requirement.
  - A small English `llms.txt` route.

### Contact and integration-service requests

- One form component with two variants: Developers has the full fields, Contact has fewer.
- The form posts to a thin server route that passes the client IP to a Convex action. That action holds the logic:
  - honeypot check;
  - rate limit (~5 per hour per IP);
  - server-side email validation;
  - sending through the app's existing Resend sender to `CONTACT_TO`, with `Reply-To` set to the visitor.
- Submissions are **never stored**.
- No reCAPTCHA. Add Turnstile only if spam appears.

### Sign-up and abuse ([Free Pages abuse and sign-up](issues/10-free-pages-abuse-and-sign-up.md))

- **Verification:** Better Auth `requireEmailVerification` for password sign-ups. The user can't sign in until the email is verified. Magic link is unchanged.
- **Addresses:** disposable domains are blocked at sign-up against a maintained list, with a plain message. Free-mail is allowed with the same 20 Pages. No `+tag` or dot normalisation.
- **Rate limits:** Better Auth's rate limiter **with database storage** on sign-up, password sign-in and magic-link sending: ~5 per 10 minutes per IP and 3 magic links per hour per email. Confirm that the real client IP reaches Better Auth through the `/api/auth` proxy.
- **Form:** unchanged, plus a honeypot field and the line "By creating an account you agree to the Terms and Privacy policy." (links, no checkbox).
- **Notification:** a Resend email to Rob for each new Organisation, including the email domain.

### Plans, Pages and quota ([Plans and pricing model](issues/03-plans-and-pricing-model.md))

- **Per-Organisation state:** a Plan (starter / team / business / custom / internal-unlimited, or none), a Page allowance per period, the period's reset date, Pages used this period, Top-up Pages valid until the period end, and a Free Pages balance. Without a Plan, the Organisation runs on Free Pages only.
- **Free Pages:** 20, granted only when a user creates their **first** Organisation. Invitations grant nothing. They never renew or expire.
- **What counts:** a Page is charged once, when Vink accepts a PDF for reading, at `documents.create` (including multi-file and email-in) and at Form Proposal sample upload. These never charge: the sample becoming the first Document, a retry after Extraction Failed, and a Change Form. A Rejected Document is not refunded.
- **Order of use:** Free Pages first, then the Plan allowance, then Top-ups. Rob can override this when setting things by hand.
- **Refusal:** a PDF that doesn't fit the remaining Pages is refused **whole** at acceptance, with an error carrying the remaining count and the PDF's page count. Nothing already accepted is affected.
- **Reset:** unused Pages expire at the reset date (no roll-over), and a scheduled job advances periods.
- **In the app:**
  - a remaining-Pages indicator and reset date;
  - an 80% warning;
  - Upgrade buttons that link to the marketing Contact page (outside the app root layout, so a full page load).
- **Admin operations** (internal functions Rob runs from the Convex dashboard or CLI): set Plan and allowance and reset date, add Top-up Pages, set Free Pages to 0.
- **Migration:** every existing Organisation gets the internal unlimited Plan, which never appears on the site.

### Getting documents in ([Volume intake](issues/11-volume-intake-gaps.md), [Email-in feasibility](issues/15-email-and-storage-intake-feasibility.md))

- **Multi-file upload:** the upload dialog takes several PDFs for one Form. Each file runs through the existing per-file upload and create path on its own, with its own row, progress and error. There is no new batch endpoint.
- **Intake Address:** at most one per Form. An unguessable token is stored, and the domain comes from `INBOUND_DOMAIN`, so the address reads `<token>@<INBOUND_DOMAIN>`.
  - Admin-only: switch on, switch off, replace. Replacing invalidates the old token at once.
  - Every Member can see and copy it.
- **Email path:**
  1. Cloudflare Email Routing (catch-all on the intake apex, DMARC failures rejected) hands the mail to a Cloudflare Worker.
  2. The Worker parses the MIME (25 MiB limit), writes each PDF attachment to our EU R2, and calls a **Convex HTTP action** authenticated with a shared secret. It passes the token, the sender, the time and one entry per attachment (R2 key and filename, or a reason it was skipped).
  3. The Worker holds no business logic.
- **The HTTP action** resolves the token to a Form. It then runs each attachment through the **same acceptance checks as `documents.create`** (PDF, ≤20 pages, Pages quota). Each accepted attachment becomes a Document of that Form, uploaded "by email from <sender>". Refused attachments create nothing, and their R2 objects are deleted.
- **Recent emails:** one record per received email (sender, time, per-attachment outcome), keeping the last 50 per Form. It is shown in the Form's Intake Address panel. Vink never replies to the sender.
- **Out of Pages:** refused like at upload, plus at most one email per day per Form to the Organisation's Admins ("Emails to [Form] are being refused: out of Pages", linking to Upgrade/Contact).
- **Domain:** development and testing use a throwaway domain. No customer gets an address until the permanent intake domain is live on Cloudflare (a pre-launch purchase).

### Webhook signature ([Developers page](issues/09-developers-page-and-integration-service.md))

- `X-Vink-Signature: t=<unix seconds>,v1=<hex>`, where `v1` = HMAC-SHA256 over `"{t}.{rawBody}"` with the Integration's existing `whsec_` secret. The documented tolerance is 5 minutes. The header name is unchanged. It replaces `sha256=<hex>` before the format is published. Multiple `v1` values for rotation are a later extension.

### Data, deletion and security fixes ([Security & privacy page](issues/13-security-and-privacy-page.md))

1. **Delete now:** an Admin-only action for any Document not already deleted, Approved included, with confirmation. It reuses the existing data deletion, cancels pending or retrying Deliveries, and leaves the short record (file name, uploader, approver, dates, delivery status).
2. **Retention clock:** when every Delivery of an Approved Document ends failed, retention starts at the last attempt.
3. **Retention range:** 1–365 days (today's maximum is 3650). Existing values above 365 are clamped.
4. **Response bodies:** data deletion also wipes stored receiver response bodies.
5. **Orphan uploads:** a daily job deletes R2 uploads that never became a Document within 24 hours.
6. **Test-send:** only example or empty values, or an Approved Document. `needs_review` and other states are refused.
7. **Security headers** from the Next config: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`, and a CSP in report-only mode first. The CSP must allow GA on marketing after consent.
8. **`security.txt`:** served at `/.well-known/security.txt`, pointing to `security@<domain>` from config.

## Testing Decisions

- **Good tests test external behaviour through the highest seam.** They act as a real caller (a user in an Organisation, the email Worker, a browser fetching a URL) and assert on what that caller can observe: a refusal and its message, a Document and its state, remaining Pages, a sent email, a response's status, headers and HTML. They never assert on internal helpers, table layouts or component structure.
- **Seam 1 (primary, CI): the public Convex API under `convex-test`**, extended. External services stay faked at the existing adapter boundary: the PDF store, outbound HTTP, the pipeline, and the email sender (a fake that records sent messages). It covers:
  - **Plans and Pages:**
    - Free Pages granted only to a first-created Organisation, not to invitees or a second Organisation;
    - charging on Document acceptance and on Form Proposal samples;
    - no charge for a retry, a Change Form or a sample becoming a Document;
    - whole-PDF refusal with the remaining and needed counts;
    - the order of use (Free Pages, then the allowance, then Top-ups);
    - the 80% warning state;
    - period reset with a fake clock;
    - internal unlimited never refusing;
    - Rob's admin operations;
    - Members can't change Plans.
  - **Multi-file:** several `create` calls where one fails (too many pages, out of Pages) and the others still succeed.
  - **Intake Address:**
    - Admin-only switch-on and replace, with the old token refused at once;
    - Members can read it;
    - the HTTP action with the shared secret (a bad secret or unknown token is refused);
    - per-attachment acceptance and refusal reasons, with refused R2 objects deleted;
    - Recent emails capped at 50;
    - out-of-Pages refusal plus at most one Admin email per day per Form.
  - **Sign-up:**
    - a disposable domain refused;
    - free-mail allowed;
    - a password sign-in refused before verification;
    - a new-Organisation email to Rob.

    Also the rate limiter's behaviour where `convex-test` can drive Better Auth. If it can't, test these checks as pure functions at the auth hooks.
  - **Contact action:** honeypot, rate limit per IP, email validation, one email sent to `CONTACT_TO` with `Reply-To`, and nothing stored.
  - **Signature:** the `t=…,v1=…` header recomputes from `"{t}.{rawBody}"` with the secret.
  - **Delete now:** Admin only (Member refused, cross-Organisation refused); Approved allowed; pending retries cancelled and never sent; data and response bodies gone; the short record kept.
  - **Retention:** the all-failed clock, the 365 maximum and clamping, and orphan-upload cleanup, all with a fake clock.
  - **Test-send:** refused for `needs_review`, allowed for example values and Approved.
  - **Invitations:** the invite URL points at `/app/invite/…` (update the existing regex).
- **Seam 2 (new, CI): HTTP smoke test against a production build.** A script runs `next build` then `next start` on a free port and fetches URLs over plain HTTP (no browser). It checks:
  - every marketing page returns 200 in EN and NL, is prerendered static (from the build output), has one `<h1>`, its own canonical, en/nl/x-default hreflang built from `SITE_URL`, and an OG image URL that resolves to an image;
  - `/en/x` redirects to `/x`; there is no locale redirect based on `Accept-Language`;
  - each old path (`/invite/…`, `/sign-in`, `/sign-up`, `/welcome`, `/o/…`) returns a permanent redirect to its `/app/…` path;
  - `/app/*` responses carry `X-Robots-Tag: noindex, nofollow`; robots.txt does not disallow `/app/`; the sitemap lists both languages and no `/app` URL;
  - security headers are present; `security.txt` and `llms.txt` resolve;
  - the initial marketing HTML loads no Google tag, and `/app` HTML contains none at all;
  - the Pricing JSON-LD Offers match the plan data module.

  For network and local-address quirks on the VPS, follow the local e2e notes (port, IPv4-first).
- **Prior art:** every `convex/*.test.ts` file, using `newBackend`, `signUp`, `addMembership`, `fakePdfStore`, `putToUploadUrl`, `pdfWithPages` and `fakeHttp` from the shared test setup. `documents.test.ts` is the model for acceptance and quota tests, `deliveries.test.ts` and `lib/signing.test.ts` for the signature, `retention.test.ts` for clock-driven jobs, and `invitations.test.ts` for the invite URL. Seam 2 has no prior art; keep it one small script next to the existing scripts.
- **Not automated:** UI components, the demo's interactions, the consent banner's behaviour after Accept, the language switcher and theme switch. They are checked by hand in a browser before launch and shown to Rob as screenshots in an Artifact (Rob can't open VPS URLs). The Cloudflare Worker gets at most a unit test of its MIME-to-request mapping. Real email routing is checked once on the throwaway domain.

## Out of Scope

- Moving to a new domain (vink.nl or similar). Everything stays behind `SITE_URL` and `INBOUND_DOMAIN`.
- Translating the app itself into Dutch. Only the `NEXT_LOCALE` cookie is shared.
- Writing the legal texts (privacy policy, terms, DPA). The pages are reserved, and the texts come from the GDPR pre-launch track.
- Blog and changelog.
- Stripe billing: checkout, subscriptions, Stripe Tax, annual billing, buying Top-ups and invoices. Rob sets Plans and Top-ups by hand.
- An upload API (`POST /documents`).
- Cloud-storage connectors (Dropbox, OneDrive, SharePoint, Google Drive). They are not mentioned on the site.
- Halving cost per page with Vertex Flex/Batch.
- Self-serve account or Organisation closing (by email for now), 2FA and SSO, a per-Organisation "Jev off" switch, signature rotation with multiple `v1` values, and Turnstile or another captcha.
- A pricing slider or calculator, customer logos, accuracy numbers, competitor names and FAQ rich results.
- Browser E2E tests.

## Further Notes

- **Pre-launch checks (operational, not build tickets):**
  - Set `RESEND_API_KEY` on prod and verify the sending domain. Until then, magic links and invitations are written to the Convex logs; clear those if possible.
  - Take the Claude bridge offline on prod: stop it under pm2 and remove the nginx `/claude-bridge/` location.
  - Ask TypeSafe for zero retention; if granted, drop "may keep logs".
  - Check the ~€0.030/page cost against the first real Vertex bill. Business annual has the thinnest margin.
  - Do a real Form Proposal run for pillar 1 and FAQ 5.
  - Confirm the Better Auth rate limits and the real client IP work on prod.
  - Buy the permanent intake apex, put it on Cloudflare, and confirm the region of Cloudflare Email Routing/Workers for the subprocessor table.
  - Create the `security@` and `CONTACT_TO` mailboxes.
  - Register the site in Search Console (DNS property) and Bing and submit the sitemap.
  - Rob records the 15-second video, and gets a founder photo.
- **Launch-price rule:** after 20 paying customers or 3 months, review prices for new customers only. Existing customers keep their price for 12 months.
- **Standing rule:** the demo and the Features screenshots mirror the app. Any change to the Documents table, review screen or a screenshotted screen updates them in the same change (see the Demo mirrors app memory).
- **Tickets should follow dependencies:**
  1. Commit the logo work first.
  2. Then the `/app` move, redirects and i18n skeleton. Everything on the site depends on it.
  3. Build Plans and Pages before opening sign-up publicly.
  4. Ship the signature change before the Developers page goes live.
  5. Ship the security fixes before the Security page goes live.
- **References:**
  - Prototypes: [Homepage directions](https://claude.ai/artifact/ULCwBhajqi5ECAW5GMGU4h) (D), [Demo behaviours](https://claude.ai/artifact/HNgL3bnsfBJfNYfUtSfRqK) (D), [Features page](https://claude.ai/artifact/GRrZDiN1L1jPeiSLuXbTik) (C). Prototype source is on the `prototype/*` branches.
  - Research findings are on the `research/*` branches listed in each ticket.
