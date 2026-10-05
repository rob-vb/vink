# Visual direction and homepage layout

Type: prototype
Status: resolved
Blocked by: 01, 06

## Question

What does the site look like? Prototype the homepage (hero with the input → reading → your-systems visual, trust row, how-it-works, document-type tabs, developer teaser, pricing teaser, closing CTA) in a couple of visual directions built on the current logo and shadcn, so we can react. Settle the sections' order, the look, and how screenshots and the 15-second video are framed. Publish the variants as an Artifact (VPS URLs can't be opened from outside).

## Answer

We picked a mix of the three prototype directions ("D · Chosen mix" in [Vink Homepage Directions](https://claude.ai/artifact/ULCwBhajqi5ECAW5GMGU4h)). Prototype source: branch `prototype/marketing-homepage`, `.scratch/vink-marketing/prototypes/`.

**Look (from A, "Product first"):** Geist and Geist Mono like the app, white and navy (`#0F1E36`, the logo colour), shadcn look, amber only for Needs Review, green for checked. Screenshots sit in a thin browser frame on a light grey panel.

**Themes:** light and dark, **light by default** (not following the system setting), with a sun/moon switch in the nav; the choice is remembered. In the build: `next-themes` with `defaultTheme="light"`, `enableSystem={false}`. Mock documents stay paper-coloured in dark mode.

**Homepage order** (left to marketing logic: promise, proof it's real, how it works, the biggest objection, data, price once value is clear, trust and objections right before the last ask):
1. Nav: logo, Features, Pricing, Developers, Security; EN/NL, theme switch, Log in, "Start free".
2. **Hero (A):** "Document. Vink. Done." with the checkmark after "Vink.", subtitle, "Start free" + "Watch 15 seconds", "20 free pages. No credit card." On the right, the real review screen (a PDF next to its Fields, one Needs Review).
3. Trust row: Stored in the EU · Deleted 30 days after sending · Nothing sent without your approval.
4. **The 15-second video, right after the hero**, as its own section in a browser frame: "One PDF in, clean data out."
5. **What happens to one document (B's journey, in A's style):** a vertical line with four stops. 1 It arrives: pillar 1 plus three document types. 2 Vink reads it: the document tabs (invoice, delivery note, handwritten form, order form) with Fields, "Read on page N" and checking. 3 You check: pillar 2 with Needs Review. 4 It lands: pillar 3 with a list of Deliveries.
6. **Two ways to connect it (C):** your developer (signed webhook, real Payload under a `POST` bar, link to Developers) next to "We connect it for you" (Vink, fixed price agreed up front, "Ask about a connection").
7. Your data, kept short: pillar 4 as one row with the retention setting and a link to Security.
8. **Pricing (A):** Starter, Team (highlighted), Business, Custom in one row, excl. VAT, "Start with 20 free pages", "See pricing".
9. **Who's behind Vink (A)** (team voice, direct email) next to the five-question FAQ.
10. Closing card: "Stop retyping. Start with 20 pages." + "Already a customer? Log in".
11. Footer: product, company and legal links, Cookie settings, language switch.

**Dropped:** A's alternating pillar rows, separate how-it-works strip and developer teaser (the journey and "Two ways" now cover them); B's paper style, data sheet, price table and letter; C's navy hero flow, "By hand vs with Vink" and pricing ladder.

**Honesty rules for the mocks:** review shows "Read on page N" plus the read text, never a highlighted region (the app has none). Confidence is shown to two decimals, never as a percentage. Screens on the live site are real screenshots, not the HTML mocks.
