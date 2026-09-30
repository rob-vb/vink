# Marketing-site patterns on Mobbin

Type: research
Status: resolved
Blocked by: 

## Question

Which marketing-site patterns and UX from comparable products (document AI, data extraction, workflow automation, strong B2B SaaS) on Mobbin can Vink reuse — hero, how-it-works, trust, use cases, developer/webhook sections, nav and CTAs, pricing — and which anti-patterns should we avoid?

## Answer

Mobbin has no pages for Rossum, Docsumo, Nanonets, Mindee, Klippa, Parseur, Extend, Instabase or Hyperscience. The closest document-AI references are Reducto (covered most fully), V7 Go, Sequence and Titan Intake. For general sections the references are Customer.io, Retool, Clay, Linear, incident.io, Sana, Height and Tines.

- **Hero:** Sequence's "sources → document being read → your systems" layout fits Vink best; Reducto's "Turn documents into data." is the typography reference. (The report suggested a tyre report in the hero; overruled — any document, never a niche.)
- **Human review up front:** "Review before anything goes out" (Runner), "Needs your judgment" (Harvey), every value links back to its source (V7). Matches Needs Review and Approval.
- **How it works:** four steps with real screen crops (Browserbase, Symbolic).
- **Trust without certifications:** a row of plain true statements directly under the hero (Zaro, Sana, Customer.io's EU data residency line).
- **Use cases:** Reducto-style tabs, each showing a document with its extracted fields — as document types, not industries.
- **Developers:** show the real JSON Payload under a `POST` endpoint bar (Loops), plus a "little code needed" indicator (Customer.io).
- **Nav and close:** four links or fewer, a quiet "Log in", one strong primary CTA; a closing card with "Already a customer? Log in" (Tines); legal links in the footer from day one.
- **Pricing:** a Stripe-style documents-per-month slider fits usage pricing; if prices aren't settled, "starts at… / Let's talk" (Customer.io).
- **Avoid:** badge walls without real certifications, abstract heroes, a chat box as hero, several equal-weight CTAs, long demo forms, accuracy percentages without method, empty logo or funding banners.

(The report's demo-request CTA and Dutch copy are overruled by the self-serve and English-default decisions.)

Findings: branch `research/marketing-site-patterns`, file `.scratch/vink-marketing/research/marketing-site-patterns.md` (13 sections with Mobbin links).
