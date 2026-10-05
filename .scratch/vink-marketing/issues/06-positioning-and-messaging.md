# Positioning and messaging

Type: grilling
Status: resolved
Blocked by: 01

## Question

What is Vink's core message to operations and admin teams, given that it handles any document? Settle: the one-line value proposition and hero headline direction, the three or four pillars (e.g. reads anything including handwriting, you review only what's unsure, it lands in your systems, EU and privacy), which proof we can honestly show without customers or certifications, the name for the free start CTA, and how the Developers page and the paid integration service are introduced. Use `marketing-skills:product-marketing` and `copywriting`.

## Answer

Full context for the other marketing skills: `.agents/product-marketing.md` (v1). The copy and pillar wording below is final.

- **Category and enemy:** "automated data entry" in copy, "document data extraction" for SEO. The enemy is retyping and processing by hand (NL *overtikken*, *handmatig verwerken*); template/OCR tools that break on new layouts come second.
- **Hero:** "Document. Vink. Done." (NL "Document. Vink. Klaar."); the checkmark logo carries the pun. Subtitle: "Vink reads any PDF, typed, scanned or handwritten, and turns it into clean data for your systems. You only check what it isn't sure about." CTA **"Start free"** everywhere, with "20 free pages. No credit card." underneath.
- **Trust row:** "Stored in the EU · Deleted 30 days after sending · Nothing sent without your approval".
- **Pillars:**
  1. **Any PDF. Even handwriting.** Typed, scanned or handwritten, one page or a bundle of papers. No templates to build.
  2. **You only check what's unsure.** Every value shows what was read and on which page. Vink flags what it isn't sure about, and nothing goes out until you approve it.
  3. **Straight into your systems.** Approved data goes to your system as clean JSON, and Auto-Send handles the documents Vink is sure about. No developer? We'll connect it for you.
  4. **Your data, kept short.** Stored in the EU and deleted 30 days after sending. You see exactly who processes it.
- **"AI":** never in visible copy. It is allowed in meta and SEO ("Vink: AI document data extraction for operations teams"), plus one factual line on Developers ("reads with Gemini on Vertex AI, EU region").
- **Proof without customers:**
  - Show the product itself: real screens, the demo and a real Payload.
  - A team block ("Who's behind Vink") with direct email, on Home and Contact.
  - "Most documents in under a minute" (measured 16–55 s for 1–3 pages).
  - No accuracy percentages: the benchmark is 5 documents.
  - No competitors named, no logos, no founding-customer offer. The integration service is always paid.
- **FAQ on Home, five objections:**
  1. Wrong reads: you see what's unsure, and nothing is sent without approval.
  2. Messy or handwritten documents: try it on 20 free pages.
  3. No developer: we build the connection (paid).
  4. Where the data goes: stored in the EU, deleted after 30 days, with a subprocessor list.
  5. Templates: none needed. Describe the fields or let Vink propose them from one example; Vink then matches every new document to the fields by itself, whatever the layout.
- **Developers and integration service:** "Developers" is in the nav. The service is introduced on Home under pillar 3 for ops teams without a developer; details on the Developers page.
- **Audience:** ops and admin teams, Netherlands first, small to large. The anti-persona is internal. On the site only the hard limit appears, in the FAQ: "PDF, up to 20 pages".
- **Voice:** clear, calm, precise. No AI slop: no em-dashes, hype or exclamation marks. Dutch uses *je*.
- **Correction to Plans and pricing model:** the Pricing page's "Every plan includes" must say "Stored in the EU", not "EU hosting". Jev (TypeSafe, US) receives the Reading.

**Facts behind this**, from a code scan on 2026-09-29:
- **Input:** PDF only, max 20 pages, one file per upload; no images, email-in or upload API.
- **Review:** jumps to the source page and shows the read text, with no region highlight.
- **Hosting:** Convex, R2 and Vertex are EU. TypeSafe/Jev is US and keeps a perpetual right to derive logs and statistics; zero retention exists only on its enterprise plan.
- **Retention:** default 30 days after the last Delivery (Admin-configurable), 90 days if never approved.
- **Needs Review at 0.8:** catches about half the wrong values and flags about a quarter of correct ones.

**Open checks before launch:**
- A real Proposer run, for pillar 1 and FAQ 5.
- Confirm the Claude bridge is off on prod, for the Gemini line.
- TypeSafe zero retention, before any stronger EU claim.
