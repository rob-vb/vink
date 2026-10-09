# PLAN — Vink: any input, routed to a Form

Source: the grilling session of 2026-10-08. The full decision record is in the memory file `employer-pivot.md`.
Goal: Vink takes any input (PDF, email text, photo/scan). A router picks the Form. The rest of the pipeline stays: Read → Match → Fill → review → Integrations.

## Start here (new session)

1. Read this file, then `GLOSSARY.md`, `docs/adr/0003-reading-then-jev-matching.md` and the Next.js docs note in `AGENTS.md`.
2. Create or check out the branch `any-input` from `main`.
3. Take the first unchecked step under **Status**. Do it, prove it, tick it off, and commit it.
4. Do not push and do not deploy. Report to the user in Dutch at B1 level.

## Gates (read first)

- **Approved to build (user, 2026-10-08).** Steps 1–12a may be built now, before the employer talk. Start a new session at step 1. No need to ask again.
- **Employer talk.** The user talks to Heisterkamp in person. Until the user reports the outcome, nothing reaches prod and no marketing copy changes (Q10). This blocks steps 13 and 15 and any deploy.
- **Make app.** It is in review. Step 12b waits until Make approves it.
- **Real services.** Build on fakes. Test Vertex, R2 and the Worker on the real services once, at the end (step 15).
- **Branch.** Use `any-input` from `main`. Nothing gets pushed without the user's OK.

## Decisions (do not re-open)

| # | Decision |
|---|---|
| Inputs v1 | PDF, email body (with attachments), images (JPG/PNG/HEIC) |
| Reader choice | Picked by MIME type, with no AI |
| Form choice | Jev picks among the Organisation's Forms, then the existing `doesNotFit` (`convex/lib/fit.ts`) gates the result. With one Form, the gate still runs. If no Form fits, the Document goes to the **No Form** list. |
| Email split | Jev decides whether an email becomes one Document or several. When unsure: split + Needs Review. No split/merge UI in v1. |
| Intake | New: one Intake Address per Organisation, which goes through the router. The per-Form addresses stay and skip the router. Form is optional at upload and in the API. |
| Usage | Customers send only mails Vink must process. There is no noise filter. Every Item counts, including Items in No Form. |
| Billing unit | **Page → Item**. 1 PDF page, 1 email or 1 photo = 1 Item. Rename it in UI, Stripe, GLOSSARY and code. `pageCount` stays (it is a real fact about a PDF). |
| Transport | No technical exclusion. No marketing, examples or templates for SBI H, 45 or 77.1. The terms get a right to refuse/end accounts. |
| Review pane | Email = headers + body + attachment list, with highlighting of the source text. Image = zoomable, with no source highlighting in v1. The Demo mirrors the app. |
| Onboarding | Setup in 3 steps after sign-up: Form → System (can be skipped; Documents then shows "Nog geen systeem gekoppeld") → Input. After that, Documents stays the home page. |
| New Form | From a sample (PDF, photo or email), from a description in words (new), or blank. No templates in v1. |
| Renames (approved) | `pdfKey` → `fileKey` and `convex/lib/pdfLimits.ts` → `inputLimits.ts`, because they will cover images and emails as well (step 3) |
| Homepage | Headline "Input. Vink. Klaar."; a "Zo werkt het" section in the order Form → Systeem → Input; the story is "stuur door naar je Vink-adres". |

## Steps

Each step ends green on `npm run typecheck`, `npm run lint` and `npm test`. Each step also has its own proof below.

### 1. Domain docs
- Add ADR `docs/adr/0010-any-input-routed-to-a-form.md`. It supersedes the PDF-only assumption in ADR 0003 and the Page unit in ADR 0007.
- Update `GLOSSARY.md`: Document (PDF, email or image), Item (replaces Page, Free Items), Router, No Form, Organisation Intake Address. Update the Relationships section too ("processed against exactly one Form" becomes "at most one").
- **Proof:** the user reads the ADR and the GLOSSARY diff. `grep -n "PDF" GLOSSARY.md` shows only definitions where PDF is meant.

### 2. Rename Page → Item
- Rename in `convex/pages.ts` (→ `items.ts`), `chargePages`, `FREE_PAGES`, `setFreePages`, `pages-card.tsx`, `pages-usage.tsx`, `messages/*`, the billing tests and the Stripe sandbox product/price names.
- Organisation fields in the Convex schema: widen → backfill → narrow. Prod has data.
- **Proof:** tests pass. `grep -rnE "chargePages|FREE_PAGES|freePages|Free Pages" --exclude-dir=node_modules .` returns 0 hits, except `pageCount`. The Stripe sandbox shows the new names (check with the Stripe CLI). The migration runs on a dev copy and gives the same totals.

### 3. Input model
- Document gets `kind: "pdf" | "email" | "image"` and `mimeType`. `pdfKey` → `fileKey` (the stored file is no longer always a PDF). `pdfStore.ts` stores the real MIME type.
- Item count: pdf = `pageCount`, email = 1, image = 1.
- Limits: `convex/lib/pdfLimits.ts` → `inputLimits.ts`. Also update the copies in `deploy/nginx.conf` and the Worker.
- **Proof:** unit tests for the Item count per kind. The existing PDF tests are unchanged and still green.

### 4. Readers per kind
- `models.ts` `viaVertex` takes a `mimeType` (it is hardcoded to `application/pdf` at line 139 now).
- Image reader: Vertex with the image MIME type. There is no text layer, so Verify skips the support check (that path already exists).
- Email reader: subject, sender, date and body go in as text. Attachments go in as extra parts. Verify uses the body as one "page".
- `Reader.read(pdf)` becomes `read(input)`. Also update `proposer` `sample.pdf`.
- **Proof:** vitest with the fake model for each kind, Jev included. Eval fixtures: one complaint email, one photo of a handwritten work order, one PDF invoice.

### 5. Router: choose the Form
- `formId` on Document becomes optional, with the new state **No Form**.
- Jev picks a Form from the Reading plus each Form's name/description. Then Match + `doesNotFit` act as the gate. If the gate fails, the Document goes to No Form.
- The Item is charged at Read, whatever the outcome.
- **Proof:** tests with fake Jev: 2 Forms route correctly; input that does not fit goes to No Form; with 1 Form, input that does not fit goes to No Form; the Item is charged in every case. Moving a Document from No Form to a Form reuses the "move to another Form" flow (`changeForm.test.ts` covers it).

### 6. Email in: whole mails + split
- Worker (`workers/intake-email/src/map.ts`): pass the whole mail (body + PDF/image attachments) instead of PDFs only. `skipped: "not_pdf"` only applies to other file types now.
- Convex: Jev decides one Document or several. When unsure: split + Needs Review.
- Organisation Intake Address next to the per-Form addresses.
- **Proof:** Worker unit tests: Organisation address → router; Form address → that Form. Fixtures: complaint + photo → 1 Document; empty body + 3 PDFs → 3 Documents; ambiguous mail → split + Needs Review; a newsletter still counts 1 Item.

### 7. Upload + public API
- Upload dialog and API accept PDF, JPG, PNG, HEIC and email text. Form is optional.
- Update the 415 errors and the API docs.
- **Proof:** `convex/publicApi/documents.test.ts` gets cases for each kind and for a missing Form. An unknown type still gets 415.

### 8. Review screen + Demo
- Email pane and image pane next to `pdf-pane.tsx`. A No Form list in Documents.
- Mirror both in `components/demo/` (the demo must mirror the app).
- **Proof:** local browser e2e on port 3013 (see the memory file `local-e2e-against-dev.md`). Open each kind. Try empty values, double approve and a refresh during review. Publish the screenshots to an Artifact for the user.

### 9. Onboarding in 3 steps
- After sign-up: Form → System (can be skipped) → Input. This replaces the empty state in `document-list.tsx:53`. Members without Forms keep the current message.
- **Proof:** e2e with a new account: complete all steps; skip System and check that the notice appears; refresh in the middle of the setup and resume at the right step.

### 10. New Form: sample, description, blank
- `sample-upload.tsx` accepts PDF, photo or a pasted email. New: "describe in words", where AI proposes the Fields (Form Proposal).
- **Proof:** vitest with the fake model for the description path. e2e: make one Form each way.

### 11. Terms: right to refuse
- Add a clause to the legal texts (NL+EN): Vink may refuse a sign-up or end an account.
- **Proof:** both pages render and show the clause.

### 12. Integrations
- a) Zapier `send-document`: Form optional, more file types. **Proof:** the Zapier tests pass.
- b) Make: **only after approval.** Publish the change as a new version.

### 13. Marketing copy (gate: employer OK)
- "Input. Vink. Klaar.", the inputs line, "Zo werkt het" (Form → Systeem → Input), "stuur door naar je Vink-adres", and the Item rule on the pricing page. NL+EN.
- **Proof:** grep the copy, placeholders and example names for the whole transport domain: transport, logistiek, vracht, vrachtbrief, CMR, chauffeur, rit, koerier, expeditie, fleet, wagenpark, lease, verhuur, garage, banden, kenteken, truck, trailer. Show the hit list to the user before calling this done. Then take e2e screenshots.

### 14. Demo film
- Re-record it with an email scene and a photo scene, after steps 8 and 13. Project: `/mnt/HC_Volume_105734306/vink-video`.

### 15. Real-service checks (end)
- Vertex with an email and with an image. R2 with image MIME types. The Worker on the real domain. Stripe sandbox with the Item names.
- **Proof:** one real run per kind on dev/prod, done with the user.

## Status

- [x] 1 · [x] 2 · [x] 3 · [x] 4 · [x] 5 · [x] 6 · [x] 7 · [~] 8 · [~] 9 · [~] 10 · [x] 11 · [x] 12a · [ ] 12b · [ ] 13 · [ ] 14 · [ ] 15

`[~]` = built and green on fakes; the browser e2e is still open.

## Decided after the plan (user, 2026-10-09)

- **Items for an email:** a Document counts the sum of its parts. Email text with content = 1, each PDF attachment = its `pageCount`, each image = 1. A text Jev calls only a cover note = 0. Small inline signature images (< 50 KB) are dropped and cost nothing.
- **Describe in words** gets a daily cap per Organisation.
- **Dev push** for the browser e2e is OK.

## Open checks (need a deployment, a real service or the user)

- Step 2: run `items:backfillItems` on dev, then on prod (a second run returns zeros); after that, do the `TODO(narrow)` cleanup. Run `scripts/stripe-setup.mts` on the sandbox (prod uses it too) for the Item names. Browser check of the Items card and the out-of-items message. The public API error code is now `out_of_items` (was `out_of_pages`).
- Step 3: run `documents:backfillInputKind` on dev, then prod (second run returns zeros), then `TODO(narrow)`. Note: the schema never had `pdfKey`; only `extraction.input`'s return value was renamed to `fileKey`. Image max 10 MB; email body 200 KiB, max 10 attachments.
- Step 4: real Vertex run per kind (HEIC, multi-part email, thinking levels); `npm run eval` on the two synthetic fixtures + `invoice-001`. An email is stored as one JSON file (`StoredEmail` in `convex/lib/readerInput.ts`) with each attachment under its own key; step 6 intake must write that shape. Verify truncates page text at 6000 chars (long email bodies).
- Step 5: real Jev run of the Router (pick quality, probabilities, tokens with many Forms). Max 254 Forms offered. Jev may answer `none`. Step 8 must add the No Form tab (`listedStates`), No Form review actions and the `routed`/`no_form` history events.
- Step 6: real Jev run of the split question (is 0.8 right?); real Worker run (text + HTML-only, HEIC/PNG, inline logo); R2 copy under `${emailKey}/n` + delete; browser check of "All Forms" in the Email-in dialog. Worker and Convex must deploy together (skip names changed). Out-of-items now refuses a whole mail. Total attachment cap 12 MB.
- Step 7: browser check of the upload dialog (tabs, "Vink picks the Form", double submit, HEIC/.eml drop, out-of-items). Real R2 PUT with image/heic and message/rfc822. Deploy `deploy/nginx.conf` (new 413 text). Real iPhone HEIC via app + API. New `POST /v1/documents` (form optional); spoofed Content-Type → 415 `media_type_mismatch`. `.eml` uses a hand-written parser (`convex/lib/emailParse.ts`, no new dependency); upload/API emails are never split. Step 13: `messages/*/developers.json` still says PDF only.
- Step 12a: real Zap run (PDF, photo, .eml) and `zapier push` by the user; zapier-platform-core 19.1 → 19.2 warning (D027) not upgraded.
- Step 8 e2e (port 3013): each kind (PDF, email body-only / with PDF / with image, JPG/PNG, old Document without kind); email body highlight + jump to attachment page; image zoom (buttons, Ctrl+wheel, pinch, keys), HEIC fallback in Chrome; empty values; double approve; refresh mid-review; No Form tab → Change Form / Reject; history events + split alert; demo NL+EN, dark, phone width. R2 CORS GET for the email JSON. `features.json` (demo description) changed with the demo; `done.body` "20 free pages" is for step 13.
- Step 10 e2e: one Form each way (PDF / JPG / HEIC / pasted email / .eml sample, describe in words, blank); double click on Describe makes one proposal; refresh mid-progress; out of Items; phone width. Real Vertex run of `proposer.describe`.
- Step 9 e2e: new account completes all 3 steps; skip System → notice, then connect an Integration → notice gone; refresh at each step + second Admin; return via the setup bar from each new-Form way; Organisation address in step 3 (needs `INBOUND_DOMAIN`); Member session; older Organisation without a Form gets step 1; dark mode, phone width, screen reader.
- Review 6–10 fixes: `.eml` parsing still runs inside the upload/API action (not moved to an internal action; memory risk with a ~10 MB quoted-printable mail). If Convex is unreachable, the Worker keeps its R2 files (Vink may have committed them), so rare orphans under `intake/` are possible. The cover-note row shows as "refused" in Recent emails.
- Step 11: browser render of the terms page (NL+EN); a lawyer reads the new clause.

## Review follow-ups (from the step 2–3 review)

- [x] Paginate `documents.backfillInputKind` (and `items.backfillItems`) with a cursor; one mutation over the whole `documents` table breaks past ~8k rows. Do this right after step 4 (step 4 may touch `documents.ts`).
- [x] Step 8: `messages/*/demo.json` still says "pages left"; the demo must mirror the app ("items").

## Review follow-ups (from the step 4–5 review)

- [x] (to step 6 worker) Server builds the email JSON; attachment keys under `${emailKey}/`, checked per org; shape validated; delete helper removes attachments (reject/delete/retention); total-bytes cap; deterministic read failures not retried.
- [x] After step 6: a routed Document never Auto-Sends in v1 (always Needs Review; reconsider with a probability threshold after real Jev runs). A routed Document with zero matched Fields counts as does-not-fit (Forms without required Fields would otherwise swallow everything). Router token budget like `matchPlan.ts` (shorten Reading/criteria; over budget → No Form, not a failure). Skip the Router when the Reading has no leaves.
- [x] Step 7: sniff magic bytes at intake, never trust the client MIME type. Ship the `form_id: null` / `no_form` API contract change with step 7 and note it for API clients.
- [x] Step 8: No Form tab + Change Form / Reject buttons for `no_form` (step 5 is not deployable before step 8).

## Questions for the user

- **Live demo is transport-flavoured (found 10-08, not changed: marketing gate).** The demo and home page use a "pakbon" from "Van Dijk Logistiek" with pallets and "1 pallet corner damaged": `components/demo/demo-data.ts:148-158`, `demo-papers.tsx:147-183,413`, `home-stills.tsx:141-150`, `demo-state.ts:104`, `app/(marketing)/[locale]/page.tsx:222,252,292,302`, `features/page.tsx:166`, `messages/*/home.json` (lines 4, 12, 84, 136), `messages/*/features.json` (alts 75, 106); Orders "Leverdatum"/"Please deliver" (`demo-data.ts:186`, `demo-papers.tsx:243,254`); newsletter "gratis bezorging". Proposal: replace with a quote or service report in step 13 (or earlier if the user wants it off prod now). Tests still use tyre/kenteken/Acme Fleet data (not visible to customers).


## Review follow-ups (from the step 6–10 review)

- [x] Linear `htmlToText` (was quadratic), cover note only ≤ 4000 chars + trace row, R2 clean-up on failure, image sniffing at intake, length caps, idempotent after accept, RFC 2231 filenames, Zapier sends octet-stream, `checkIssued` needs an `uploads` row, demo complaint is now a leaking espresso machine.
- [ ] Optional: move `.eml` parsing into an internal action.

## Failed attempts

(none yet; after two failed tries on one step, note it here and re-plan)
