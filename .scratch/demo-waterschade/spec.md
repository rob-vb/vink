# Demo document: waterschade meldformulier (replaces the pakbon)

Status: ready-for-agent
Branch: build on `any-input` (or a branch from it). Do not push, do not deploy.
Deploy: only with the user's OK, like every deploy.

## Why

The demo and home page show a "pakbon" from "Van Dijk Logistiek" with pallets. That is transport, and Vink must not show transport examples (PLAN.md Decisions, "Transport"). The user chose candidate 1 of the research in `.scratch/vink-marketing/research-digital-docs-retyped-nl.md`: a waterschade meldformulier at an assurantiekantoor. It is digital input that a person must read and judge, so Vink's value is time saved on assessment.

Story (NL): "Klanten mailen een schadeformulier. Vink zet het in je schadesysteem, en de behandelaar kijkt alleen waar iets niet klopt."

## Start here (new session)

1. Read this file, `PLAN.md` (Decisions + Questions), `GLOSSARY.md`, and the memory notes `demo-mirrors-app.md` and `no-tyre-examples.md`.
2. Read the research file above, section "Top 3", candidate 1.
3. Check `git log --oneline -5` on `any-input`. The e2e bug fixes B1–B5 (demo version label, NL demo values) must be committed first; if not, finish those first.
4. Do the steps below in order. Tick each one here and commit it.

## Decisions (do not re-open)

| # | Decision |
|---|---|
| Sender | An invented private customer mails an invented assurantiekantoor. No real company or person names. |
| Input | One email via the Organisation Intake Address: a short text ("Bijgaand het schadeformulier en twee foto's") + a filled-in PDF meldformulier (digital, typed) + 2 photos. Jev keeps it together: 1 Document, Router picks the Form "Schademeldingen". This shows the new any-input flow. |
| Items | Text 1 + PDF 1 page + 2 photos = 4 Items (the confirmed email rule). If the text is only a cover note, it is 0 and the total is 3. Pick one and make the demo copy match. |
| Needs Review | Use only what Vink really does: per-field confidence below the threshold → "Te controleren". Vink has no sum check or policy lookup; do not show one. Good candidates for low confidence: a value only visible on a photo, a vague "oorzaak". |
| Language | NL and EN demo. The PDF and the email are Dutch in both languages (they are what the customer sent); Field labels follow the UI language; values are what the paper says (Dutch). Match how the e2e fix B4 handled this. |
| Look | Same panes and flow as the app (email pane + PDF pane + image pane). The demo must mirror the app exactly. |

## The document

**Form "Schademeldingen" / "Damage claims"** (Fields, NL label / key):
- Polisnummer / `policy_number`
- Naam verzekerde / `insured_name`
- Risicoadres / `risk_address`
- Schadedatum / `damage_date`
- Oorzaak / `cause` (choice: Lekkage leiding, Wasmachine of vaatwasser, Neerslag, Overig)
- Toelichting / `description`
- Beschadigde zaken / `damaged_items` (List: omschrijving, aanschafjaar, aanschafwaarde, geclaimd bedrag)
- Totaal geclaimd / `total_claimed`
- IBAN / `iban` (use the well-known example IBAN NL91ABNA0417164300, not a customer's account)
- Foto's bijgevoegd / `photos_attached` (yes/no)

**PDF page (1 page, A4)**: header of the invented assurantiekantoor, "Schademeldingsformulier woonhuis/inboedel", the fields above as a filled-in form, a table of 3–4 damaged items (laminaat woonkamer, onderkast keuken, vloerkleed, …) with amounts that add up to the total, date and a typed name as signature.

**Photos (2, drawn)**: wet laminate with swollen seams; a water stain on a kitchen cabinet base. Drawn like the existing demo photos (SVG in `components/demo/demo-papers.tsx`), no stock photos.

**Email text**: 3–5 lines, Dutch, from the customer, policy number in the text too (so the email pane highlight has something to mark).

## Steps

Each step ends green on `npm run typecheck`, `npm run lint` and `npm test`.

### 1. Names and content
- Pick the assurantiekantoor name, customer name, address (invented street in an invented or generic place), policy number, dates (September 2026), items and amounts. Web-check that the office name is not a real Dutch firm.
- **Proof:** a short list of the chosen values in this file under "Comments"; the web check result.

### 2. Demo data
- `components/demo/demo-data.ts`: replace the seed `delivery` (lines ~148-158) with a seed `claim` (email + PDF + 2 photos, Form "Schademeldingen", routed). Update `components/demo/demo-state.ts:104` (`seed.id === "delivery"`) and any other id use. Keep the seed count and the "done" card text consistent (`messages/*/demo.json`).
- Also remove the other delivery-flavoured demo text: the Orders Field "Leverdatum / Delivery date" (`demo-data.ts:186`) and its paper (`demo-papers.tsx:243,254`), and the newsletter's "gratis bezorging / free delivery" (`demo-data.ts:234-235`).
- **Proof:** `components/demo/demo-data.test.ts` updated and green (every page-1 `readText` appears in the email body, every Field has a source page).

### 3. Demo papers
- `components/demo/demo-papers.tsx`: draw the PDF meldformulier and the two photos; remove the pakbon paper (lines ~147-183, ~413).
- **Proof:** render each SVG to PNG once and look at it (light + dark, phone width).

### 4. Home page and features page
- `components/demo/home-stills.tsx:141-150` (keys `pallets`, `received_by`), `app/(marketing)/[locale]/page.tsx:222,252,292,302` (tab `deliveryNote`, `documentId: "delivery"`), `app/(marketing)/[locale]/features/page.tsx:166`, `messages/*/home.json` (lines 4, 12, 84, 136), `messages/*/features.json` (alts at 75, 106). Rename `deliveryNote` → `claimForm` and rewrite the copy in NL + EN.
- **Proof:** grep shows no `delivery|pakbon|pallet` left in these files (the Vink term "Delivery" for an Integration send is fine).

### 5. Domain grep and screenshots
- Grep copy, placeholders, example names and the demo for the whole transport domain: transport, logistiek, vracht, vrachtbrief, CMR, chauffeur, rit, koerier, expeditie, levering, bezorg, pallet, pakbon, fleet, wagenpark, lease, verhuur, garage, banden, kenteken, truck, trailer, delivery note, shipment, courier, tyre. Show the hit list to the user.
- Browser e2e on port 3013 (memory `local-e2e-against-dev.md`): home page stills, `/features` demo NL + EN, light + dark, 390 px; open the claim, check the email highlight, the PDF, both photos (zoom), Approve flow. Publish the screenshots as an Artifact.
- **Proof:** the hit list and the Artifact link, shown to the user.

### 6. Eval fixture (optional, helps step 15)
- Add `fixtures/documents/synthetic-claim-email-001/` (the same email as `.eml` with the PDF and photos as attachments) + `fixtures/forms/damage-claim.json`, so the real Vertex/Jev run at the end covers this kind.
- **Proof:** the harness loads it (`scripts/eval/harness.test.ts` pattern).

## Out of scope

- The demo film (PLAN.md step 14) is re-recorded later with this document.
- Any deploy without the user's OK.

## Comments
