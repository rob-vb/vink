# Product Marketing Context

**Document version:** v1
**Last updated:** 2026-09-29

Source of the decisions: [Positioning and messaging](../.scratch/vink-marketing/issues/06-positioning-and-messaging.md). Product vocabulary: `CONTEXT.md` (copy may be plainer, never contradictory).

## Product Overview
**One-liner:** Vink turns any PDF, even handwritten, into clean data for your systems, so your team stops retyping documents.
**What it does:** Vink reads PDFs (typed, scanned or handwritten, one page or a bundle of papers) and fills the fields a team defines. Values it isn't sure about are flagged for a person to check. After approval, the data goes to the team's own system as JSON.
**Product category:** "automated data entry" in copy (how ops teams name the problem); "document data extraction" as the SEO/subtitle term. Not "intelligent document processing".
**Product type:** B2B SaaS, self-serve.
**Business model:** metered per Page; Free Pages (20, once), Starter, Team, Business, Custom. See [Plans and pricing model](../.scratch/vink-marketing/issues/03-plans-and-pricing-model.md). Separate paid integration service by Rob.

## Target Audience
**Target companies:** operations and admin teams, Netherlands first, small to large companies (larger parties welcome, served through Custom).
**Decision-makers:** ops/admin lead (user and champion); finance or owner (buyer); IT or a developer (technical influencer, Developers page).
**Primary use case:** stop retyping or processing incoming documents by hand.
**Jobs to be done:**
- Get the data from incoming PDFs into our system without retyping it.
- Only spend attention on the values that might be wrong.
- Handle new document layouts without building templates.
**Use cases:** any document type. Never lead with one niche (never tyre reports). Examples are varied: invoices, delivery notes, order forms, handwritten forms.

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Ops/admin lead | Time, fewer mistakes | Team retypes documents all day | Clean data out; you only check what's unsure |
| Finance/owner | Cost, risk | Manual processing is slow and error-prone | Per-page pricing, 20 free pages, nothing sent without approval |
| IT/developer | Clean integration, security | Another system to connect | Signed JSON webhook, retries, test-send; or Rob builds it |

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
- Stored in the EU, deleted 30 days after sending.
- A real person (Rob) who can build the connection for you.

## Objections
| Objection | Response |
|-----------|----------|
| What if it reads something wrong? | You see what's unsure, and nothing is sent until someone approves it. |
| Our documents are messy / handwritten. | Try it on your own documents: 20 pages free. |
| We have no developer to connect it. | We'll build the connection for you (paid integration service). |
| Where does our data go? | Stored in the EU, deleted 30 days after sending, full subprocessor list. |
| Do I need to set up templates? | No. Describe your fields, or let Vink propose them from one example. After that, Vink matches every new document to your fields by itself, whatever the layout. |

**Anti-persona (internal, not on the site):** needs photo or email intake, PDFs over 20 pages, bulk upload via API, ready-made Exact/AFAS connectors, or fully autonomous processing without any human check. On the site only the hard limit appears, in the FAQ: "PDF, up to 20 pages".

## Switching Dynamics
**Push:** retyping is slow and error-prone; template tools break.
**Pull:** any document, only check what's unsure, lands in your system.
**Habit:** "we've always done it by hand"; existing template tool.
**Anxiety:** wrong data sent automatically; where the data goes; connecting it.

## Customer Language
**How they describe the problem:** "overtikken", "handmatig verwerken" (EN: retyping, processing by hand).
**Words to use:** retyping, by hand, clean data, your systems, check, approve, unsure.
**Words to avoid:** AI, AI-powered, OCR, intelligent document processing, template, accuracy percentages, Enterprise.
**Glossary:** see `CONTEXT.md` (Form, Field, Document, Page, Needs Review, Approval, Auto-Send, Payload, Integration).

## Brand Voice
**Tone:** clear, calm, precise. Short sentences. Honest about uncertainty, because that is the product.
**Style:** direct; outcomes over technology. Dutch version uses *je*.
**Personality:** precise, down-to-earth, helpful.
**No AI slop:** no em-dashes, no hype words, no exclamation marks, no "unlock/seamless/revolutionize", no triads for their own sake.

## Messaging
**Hero:** "Document. Vink. Done." (NL: "Document. Vink. Klaar."). The logo is a checkmark, so the image carries the pun for English readers.
**Subtitle:** "Vink reads any PDF, typed, scanned or handwritten, and turns it into clean data for your systems. You only check what it isn't sure about."
**CTA:** "Start free" everywhere, with "20 free pages. No credit card." underneath. "Log in" quiet; "Open app" when logged in.
**Trust row:** "Stored in the EU · Deleted 30 days after sending · Nothing sent without your approval"
**Pillars:**
1. **Any PDF. Even handwriting.** Typed, scanned or handwritten, one page or a bundle of papers. No templates to build.
2. **You only check what's unsure.** Every value shows what was read and on which page. Vink flags what it isn't sure about, and nothing goes out until you approve it.
3. **Straight into your systems.** Approved data goes to your system as clean JSON, and Auto-Send handles the documents Vink is sure about. No developer? We'll connect it for you.
4. **Your data, kept short.** Stored in the EU and deleted 30 days after sending. You see exactly who processes it.

**"AI":** not in visible copy. Allowed in meta descriptions and SEO titles ("Vink: AI document data extraction for operations teams"), and as one factual line on Developers ("reads with Gemini on Vertex AI, EU region").
**Developers and integration service:** "Developers" in the nav. The service is introduced on Home under pillar 3 for ops teams without a developer; details on the Developers page. Paid, never free.

## Proof Points
**Metrics:** "Most documents in under a minute" (measured 16–55 s for 1–3 page PDFs). No accuracy percentages: the benchmark is 5 documents.
**Customers:** none yet; no logos, no fake testimonials.
**Other proof:** real app screenshots, the clickable demo, a real Payload, a founder block by Rob (photo, direct email) on Home and Contact, the subprocessor list.
**Value themes:**
| Theme | Proof |
|-------|-------|
| Reads anything | Demo on varied documents incl. handwriting |
| Only check what's unsure | Review screen: read text, page, Needs Review |
| Lands in your systems | Real JSON Payload, signed webhook |
| Data kept short | EU storage, retention setting, subprocessor list |

**Claims that need a check before launch:**
- Form proposed from one example (pillar 1, FAQ 5): the real Proposer hasn't run yet.
- Gemini on Vertex EU (Developers): confirm the Claude bridge is off on prod.
- A harder EU claim needs TypeSafe (Jev, US) zero retention; until then "Stored in the EU", with TypeSafe listed as a US subprocessor.

## Goals
**Business goal:** self-serve paying customers.
**Conversion action:** create an account ("Start free").
**Current metrics:** none yet (pre-launch).

## Changelog
*Newest first. One line per revision: what changed and why.*
- v1 (2026-09-29): Initial context, from the Positioning and messaging grilling.
