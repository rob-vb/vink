# Product Marketing Context

**Document version:** v3
**Last updated:** 2026-10-06 (v3)

Source of the decisions: [Positioning and messaging](../.scratch/vink-marketing/issues/06-positioning-and-messaging.md). Product vocabulary: `GLOSSARY.md` (copy may be plainer, never contradictory).

## Product Overview
**One-liner:** Vink turns any PDF, even handwritten, into clean data for your systems, so your team stops retyping documents.
**What it does:** Vink reads PDFs (typed, scanned or handwritten, one page or a bundle of papers) and fills the fields a team defines. PDFs come in by upload (several at once) or by email to a Form's own Intake Address. Values it isn't sure about are flagged for a person to check. After approval, the data goes to the team's own system as JSON.
**Product category:** "automated data entry" in copy (how ops teams name the problem); "document data extraction" as the SEO/subtitle term. Not "intelligent document processing".
**Product type:** B2B SaaS, self-serve.
**Business model:** metered per Page; Free Pages (20, once), Starter, Team, Business, Custom. See [Plans and pricing model](../.scratch/vink-marketing/issues/03-plans-and-pricing-model.md). Separate paid integration service by Vink.

## Target Audience
**Target companies:** operations and admin teams, Netherlands first, small to large companies (larger parties welcome, served through Custom).
**Decision-makers:** ops/admin lead (user and champion); finance or owner (buyer); IT or a developer (technical influencer, Developers page).
**Primary use case:** stop retyping or processing incoming documents by hand.
**Jobs to be done:**
- Get the data from incoming PDFs into our system without retyping it.
- Only spend attention on the values that might be wrong.
- Handle new document layouts without building templates.
**Use cases:** any document type. Never lead with one niche or one industry. Examples are varied: invoices, delivery notes, order forms, handwritten forms.

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Ops/admin lead | Time, fewer mistakes | Team retypes documents all day | Clean data out; you only check what's unsure |
| Finance/owner | Cost, risk | Manual processing is slow and error-prone | Per-page pricing, 20 free pages, nothing sent without approval |
| IT/developer | Clean integration, security | Another system to connect | Signed JSON webhook, retries, test-send; email intake without code; or we build it |

## Problems & Pain Points
**Core problem:** teams retype (NL: *overtikken*) or process by hand (*handmatig verwerken*) the data in incoming documents.
**Why alternatives fall short:**
- Manual keying: slow, boring, mistakes slip through.
- Template/OCR tools: break on every new layout, can't read handwriting.
**What it costs them:** hours of keying per week and errors downstream.
**Emotional tension:** fear that automation silently gets things wrong.

## Competitive Landscape
**Direct:** Parseur, DocuPipe, Docparser (review-UI apps). Never named on the site in v1.
**Secondary:** developer APIs (Reducto, Mindee, Extend): need a developer to build everything around them.
**Indirect:** manual keying, outsourced data entry.

## Differentiation
**Key differentiators:**
- Any PDF, including handwriting and bundled papers; no templates.
- Flags only what it isn't sure about; every value shows what was read and on which page.
- Nothing is sent without approval; Auto-Send for documents Vink is sure about.
- Stored in the EU, deleted 30 days after sending by default (an Admin can set 1 to 365 days).
- Real people who can build the connection for you.

## Objections
| Objection | Response |
|-----------|----------|
| What if it reads something wrong? | You see what's unsure, and nothing is sent until someone approves it. |
| Our documents are messy / handwritten. | Try it on your own documents: 20 pages free. |
| We have no developer to connect it. | We'll build the connection for you (paid integration service). Getting documents in needs no code: email them to the Form's Intake Address. |
| Where does our data go? | Stored in the EU, deleted 30 days after sending, full subprocessor list. |
| Do I need to set up templates? | No. Describe your fields, or let Vink propose them from one example. After that, Vink matches every new document to your fields by itself, whatever the layout. |

**Anti-persona (internal, not on the site):** needs photo or other non-PDF intake, PDFs over 20 pages, ready-made Exact/AFAS connectors, or fully autonomous processing without any human check. On the site only the hard limit appears: "PDF attachments, up to 20 pages each" (Home intake line, Pricing FAQ). Email intake is live since 2026-10-01, so it is no longer a reason to say no. A public API (send Documents in, read results after Approval) and standard integrations (Zapier, Make, Google Sheets, Excel, Power Automate) were decided on 2026-10-06, see `.scratch/integrations/spec.md`; the site names an integration only once it works.

## Switching Dynamics
**Push:** retyping is slow and error-prone; template tools break.
**Pull:** any document, only check what's unsure, lands in your system.
**Habit:** "we've always done it by hand"; existing template tool.
**Anxiety:** wrong data sent automatically; where the data goes; connecting it.

## Customer Language
**How they describe the problem:** "overtikken", "handmatig verwerken" (EN: retyping, processing by hand).
**Words to use:** retyping, by hand, clean data, your systems, check, approve, unsure.
**Words to avoid:** AI, AI-powered, OCR, intelligent document processing, template, accuracy percentages, Enterprise.
**Glossary:** see `GLOSSARY.md` (Form, Form Proposal, Field, Document, Intake Address, Page, Needs Review, Approval, Auto-Send, Payload, Integration). Copy says "email address" / "e-mailadres" for the Intake Address; never "inbox".

## Brand Voice
**Tone:** clear, calm, precise. Short sentences. Honest about uncertainty, because that is the product.
**Style:** direct; outcomes over technology. Dutch version uses *je*.
**Personality:** precise, down-to-earth, helpful.
**No AI slop:** no em-dashes, no hype words, no exclamation marks, no "unlock/seamless/revolutionize", no triads for their own sake.

## Messaging
Dutch is the default: the marketing site at `/` is Dutch, English lives under `/en`. Write Dutch copy first, then English.

**Hero:** "Niemand hoeft meer PDF's over te tikken." (EN: "Nobody has to retype PDFs anymore."), with the checkmark logo after it. "Document. Vink. Klaar." stays as the OG image title.
**Core message:** teams stop retyping documents by hand; Vink takes that work over, which saves hours and labour cost. Lead with that outcome, not with what Vink reads.
**Subtitle:** "Vink leest facturen, pakbonnen en werkbonnen, ook handgeschreven, en zet de gegevens in je systeem. Je team controleert alleen wat Vink niet zeker weet." (EN: "Vink reads invoices, delivery notes and work orders, even handwritten ones, and puts the data in your system. Your team only checks what Vink isn't sure about.")
**CTA:** "Gratis starten" / "Start free" everywhere, with "20 gratis pagina's. Geen creditcard nodig." / "20 free pages. No credit card." underneath. "Log in" quiet; "Open app" when logged in. Secondary hero link: "Bekijk 30 seconden" / "Watch 30 seconds" (the demo film).
**Trust row:** "Ook gescand en handgeschreven · Je eigen velden, geen sjablonen · Niets wordt verstuurd zonder jouw akkoord" (EN: "Even scanned and handwritten · Your own fields, no templates · Nothing is sent without your approval"). The EU and 30-day claims moved to the Security section of the Terms page.
**Cost calculator** ("Wat overtikken je nu kost." / "What retyping costs you now."), right after the film: the reader sets documents per day, minutes of retyping per document and labour cost per hour; it shows hours per month, cost by hand and the fitting Plan. No fixed savings claim in copy: the numbers are always the reader's own.
**Home journey** ("Van PDF tot in je systeem." / "From PDF to your system."; "Vink doet het overtikken. Je team doet alleen de controle."), four stops:
1. **Mail de PDF door, of sleep hem erin.** / Email the PDF, or drop it in. Any kind of document, even scanned or handwritten. No templates.
2. **Vink vult je velden in.** / Vink fills in your fields. Most documents ready within a minute; each value shows its page.
3. **Je team controleert alleen de twijfelgevallen.** / Your team only checks the doubtful values. Nothing is sent without approval.
4. **De gegevens staan in je systeem.** / The data is in your system. Accounting, ERP or database; Auto-Send when turned on.

**Avoid repeating** "getypt, gescand of handgeschreven" in every block: once per page at most.
**Connect block:** "Twee manieren om te koppelen." / "Two ways to connect it.": one signed webhook for your developer, or "Wij koppelen het voor je." for a fixed price agreed up front.
**Closing:** "Stop met overtikken. Begin met 20 pagina's."
**Data kept short** (former pillar 4) is no longer a Home section: it lives in the Security section of Terms (EU storage, 30-day default retention, subprocessor list).

**"AI":** not in visible copy. Allowed in meta descriptions and SEO titles ("Vink: AI document data extraction for operations teams"), and as one factual line on Developers ("reads with Gemini on Vertex AI, EU region").
**Developers and integration service:** "Developers" in the nav. The service is introduced on Home under pillar 3 for ops teams without a developer; details on the Developers page. Paid, never free.

## Proof Points
**Metrics:** "Most documents in under a minute" (measured 16–55 s for 1–3 page PDFs). No accuracy percentages: the benchmark is 5 documents.
**Customers:** none yet; no logos, no fake testimonials.
**Other proof:** the 30-second demo film (NL + EN, on Home and Features: "from paper work order to back office"), real app screenshots on Features and Developers, the clickable demo, a real Payload, a team block that speaks as Vink (no names, support email), the subprocessor list.
**Value themes:**
| Theme | Proof |
|-------|-------|
| Reads anything | Demo film (handwritten work order), demo on varied documents incl. handwriting |
| Only check what's unsure | Review screen: read text, page, Needs Review |
| Lands in your systems | Real JSON Payload, signed webhook |
| Data kept short | EU storage, retention setting, subprocessor list |

**Claims that need a check before launch:**
- Form proposed from one example (pillar 1, FAQ 5): the real Proposer hasn't run yet.
- A harder EU claim needs TypeSafe (Jev, US) zero retention; until then "Stored in the EU", with TypeSafe listed as a US subprocessor.

## Goals
**Business goal:** self-serve paying customers.
**Conversion action:** create an account ("Start free").
**Status:** live at vink.page since 2026-10-02 (Cloudflare proxy); email intake live since 2026-10-01.
**Current metrics:** none recorded yet. GA4 (behind cookie consent) counts every "Start free" click.

## Changelog
*Newest first. One line per revision: what changed and why.*
- v3 (2026-10-06): Copy refocused on the outcome (stop retyping, save labour cost) after the owner found it read like AI slop. New subtitle, journey and trust row; added the cost calculator; new H1 "Niemand hoeft meer PDF's over te tikken."; "Niets wordt verstuurd" replaces "Niets weg/verstuurd".
- v2 (2026-10-06): Fixed stale items after launch. Email intake (Intake Address) added to product, objections and glossary, and removed from the anti-persona. Messaging is now Dutch-first and follows the current Home (journey of four stops, new trust row, demo film link). Demo film and screenshots added to proof. Gemini-on-Vertex-EU claim closed (bridge retired; prod routes via our LiteLLM gateway to Vertex `eu`, checked 2026-10-06). Goals now say live since 10-02.
- v1 (2026-09-29): Initial context, from the Positioning and messaging grilling.
