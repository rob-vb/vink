# Plans and pricing model

Type: grilling
Status: resolved
Blocked by: 02

## Question

Which plans does Vink offer and how are they metered — credits or not, per page or per Document, a free tier or trial and how big, monthly/annual, overage, and an Enterprise/"talk to us" tier? What does the Pricing page show, and what must the app enforce (quota per Organisation, what happens when it runs out)? Does billing (Stripe) belong in this effort or a later one?

## Answer

**Metric and packaging.** Plans are metered in **Pages** and differ only in volume: every Form, Field, review, Approval, Auto-Send and Integration feature is on every plan, with unlimited users. Prices in EUR, shown **excl. VAT** ("+ VAT where applicable"; Stripe Tax works out the right VAT at checkout later). Monthly or annual billing, annual 20% off.

**Plans** (launch prices; cost basis ~€0.030/page from 2027):

| Plan | Pages/month | Monthly | Annual (per month) | Per page | vs Parseur | Margin at full use (mo / yr) |
|---|---|---|---|---|---|---|
| Free | 20, once | €0 | — | — | — | — |
| Starter | 300 | €49 | €39 (€468/yr) | €0.163 | −45% (€89) | 82% / 77% |
| Team (most popular) | 1,000 | €89 | €71 (€852/yr) | €0.089 | −31% (€129) | 66% / 58% |
| Business | 3,000 | €199 | €159 (€1,908/yr) | €0.066 | −26% (€269) | 55% / 43% |
| Custom | 3,000+ | from €500/month, annual only | — | ≥ €0.05 | — | ≥ 40% |

- **Why these levels:** the `pricing` skill's checks — value/price ~5× (Starter), ~9× (Team), ~12× (Business) against ~€0.80/page of manual keying saved; Team is the obvious middle choice (3.3× the pages for 1.8× the price); Business is 2.2× Team; "when in doubt, price higher". Every paid plan stays cheaper than Parseur and than DocuPipe with confidence scores. Rob first wanted 50% under Parseur everywhere; that loses money from ~5k pages/month, so it was dropped.
- **Custom** (not "Enterprise": we have no SSO, audit logs or certifications yet): more than 3,000 pages a month, a DPA, custom terms, SLA, payment by invoice, volume price. Minimum €500/month, billed annually.
- **Launch-price rule:** after 20 paying customers or 3 months, review prices for new customers only (raise if trial-to-paid > 40% or price never comes up as an objection). Existing customers keep their price for 12 months.

**Free start.** A one-time credit of **20 Pages**, no card, no expiry, never renews. Only the **first Organisation a user creates** gets it; invited users get nothing extra.

**What counts.** A Page counts once, when Vink accepts a PDF for reading: a Document upload or a Form Proposal sample. Free: the sample becoming the Form's first Document, a retry after Extraction Failed, moving a Document to another Form. Not refunded: a Rejected Document.

**When pages run out.** An upload that doesn't fit the remaining Pages is refused at upload ("You have 3 pages left; this PDF has 8") with an Upgrade button. Everything already uploaded keeps working (review, Approval, Delivery). Warning at 80%. Paid allowances renew each billing period; unused Pages expire; no automatic overage. **Top-ups:** €10 per 100 Pages, valid until the end of the billing period (always worse than upgrading).

**What the app must enforce in this effort** (billing itself is a later effort):
- a plan per Organisation with a Page allowance and a reset date, Free Pages for first-created Organisations, the refuse-at-upload check, the 80% warning and a remaining-pages indicator;
- "Upgrade" goes to Contact; Rob sets plans by hand and invoices manually until Stripe exists;
- existing Organisations (test accounts, test@test.nl, the Claude bridge) get an internal unlimited plan that never appears on the site.

**Pricing page** (Mobbin: Chatbase, Framer, ToDesktop, ClassPass, Zaro):
1. Header: "Every plan includes everything. You only choose how many pages." Monthly / Annual (−20%) toggle.
2. Three cards — Starter, Team (highlighted), Business: large price (annual shows the monthly equivalent, "billed annually"), pages/month as a chip, per-page price in small type, who it's for, "Start free" (filled on Team). All go to sign-up.
3. Under the cards: "Start with 20 free pages. No credit card."
4. Full-width Custom band: "More than 3,000 pages a month, or need a DPA and payment by invoice?" with chips and "Talk to us" → Contact.
5. "Every plan includes": unlimited users, all Forms and Fields, review and Approval, Integrations (webhook), EU hosting, 30-day retention.
6. "What counts as a page": invoice 1–2, delivery note 1, 10-page contract 10; read once, retries free.
7. Two-column FAQ: per-user cost, what is a page, running out and top-ups, roll-over, VAT, cancelling, where data lives.
8. Closing CTA.
No slider or calculator; whether the site names Parseur or DocuPipe is for Positioning and messaging.

**DocuPipe** (read from its JS bundle on 2026-09-29; its pricing page renders client-side). A Vink-style page costs 3 credits (parse 1 + extract 2), 4 with a confidence and source per field; a separate review costs 2 more. Two regimes are live as an A/B test — old: Starter free (100/month + 200 at signup), Business $99/mo for 2,500 credits ($0.08/credit overage), Premium $499 for 20k; new: Launch pay-as-you-go ($0.05/credit top-offs, 200 signup credits, **up to 20,000 with a work email**), Growth $90/mo for 3,000, Scale $500/mo for 25k, Enterprise $0.010–0.025/credit from 200k. Unlimited seats only from Premium/Scale; EU residency and retention policies only on paid plans.

**Open checks.** The €0.030/page cost comes from 5 fixture Documents; check it against the first real Vertex bill before launch — Business annual has the thinnest margin and goes first if real documents cost more.
