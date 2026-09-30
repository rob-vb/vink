# Features page content

Type: prototype
Status: resolved
Blocked by: 11

## Question

What is on `/features`? Settle which features get a section (e.g. any PDF incl. handwriting, Fields and Form Proposals, Confidence and Needs Review, value-links-to-source, Approval and Auto-Send, Integrations and Delivery, Organisations and Memberships, data kept short), in what order, and per section which real app screenshot (light and dark, which demo data — never tyre reports). Place the clickable demo (Interactive demo) on the page and decide how it relates to the sections, and whether the 15-second video repeats here. Build on Visual direction and homepage layout and Positioning and messaging; publish the prototype as an Artifact. Intake copy follows Volume intake at launch.

## Prototype

[Vink Features Page](https://claude.ai/artifact/GRrZDiN1L1jPeiSLuXbTik), variants A (demo first), B (sticky index), C (chapters). Source: `.scratch/vink-marketing/prototypes/features-variants.src.html` + `build-features.py` (goes to branch `prototype/features-page` once chosen).

## Answer

Rob picked **variant C, "Chapters"** in [Vink Features Page](https://claude.ai/artifact/GRrZDiN1L1jPeiSLuXbTik). Prototype source: branch `prototype/features-page`, `.scratch/vink-marketing/prototypes/` (A "Demo first" and B "Sticky index" kept there for reference).

**Page order:** nav (Features active) → hero "Everything between the PDF and your system." with "Start free" + "Try the demo" and "20 free pages. No credit card." → **the 15-second video, big, under the hero** (the same video as Home) → four chapters, one per stop → the "Around it" bento → closing card "Stop retyping. Start with 20 pages." → footer.

**Chapters:** each has a stop marker (1, 2, the Vink mark for "You check", 4), a heading, one line, then a **feature picker**: a list of features on the left (the open one shows its text and links), and its screenshot on the right. One screenshot is visible per chapter.

1. **It arrives** · "Getting documents in." → *Upload it or email it in* (multi-file upload, one Intake Address per Form, Recent emails, PDFs up to 20 pages, "Other sources? Tell us."); *Any PDF. Even handwriting.*
2. **Vink reads it** · "Your fields, filled from the page." → *Your fields, not a template* (field types, descriptions, Form Proposal from a sample, versions); *Every value, with its source* ("Read on page N", confidence, conflicting readings shown).
3. **You check** · "You only check what's unsure." → *Check only what's flagged* (Review Threshold 0.80, reason per flag, corrections never overwritten); *Nothing goes out without approval* (approve or reject with a reason, Auto-Send per Form and off by default, who and when).
   → **Then the demo ("Try it · demo data", "This morning's documents. Clear them.")**, full width on a grey band. It sits right after "You check", where trying it makes most sense. Home's "Try the demo" links to this anchor.
4. **It lands** · "Straight into your systems." → *Your system gets clean JSON* (signed requests, retries, test-send, one Integration for several Forms; links "Read the developer docs →" and "Ask about a connection →").
5. **Around it** (bento, three cards) · *Your whole team. No seat count.* (Admin/Member, unlimited users, several Organisations); *Your data, kept short.* (EU, 30 days, retention setting, "Delete now", link to Security & privacy); *Every plan includes everything.* (link to Pricing).

**Screenshots:** real app screenshots with demo data, **light mode only**. They are shown unchanged in dark mode, like the paper documents. One per feature:
- Upload dialog with three PDFs (one over 20 pages refused), plus the Form's Intake Address panel with Recent emails.
- The four demo documents (invoice, delivery note, handwritten form, faxed order).
- Form editor for "Invoices": six Fields, one a list, with "Propose from a sample PDF".
- Review screen of the demo invoice, "Read on page 1" on every Field.
- Demo delivery note with two values in Needs Review.
- Form settings (Review Threshold, Auto-Send) next to the Approved tab with an Auto-Send badge and a Rejected row.
- Integration "Orders API" with Deliveries: delivered, delivered, retrying.
- Members page: three people and a pending invite.
- Organisation settings > Retention, plus "Delete now" on a Document.

Demo data only (Kantoor Noord, Hoekstra, Van Dijk, Het Anker…), never tyre reports. Screenshots are refreshed whenever those screens change, like the demo.

**Mobile:** the picker stacks (list above screenshot), the bento becomes one column, and the demo behaves as decided in Interactive demo.

**Copy** follows Positioning and messaging (no "AI", no accuracy numbers) and Volume intake at launch. Final wording is polished in the build, and the NL version follows.
