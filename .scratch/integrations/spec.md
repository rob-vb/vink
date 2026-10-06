# Spec: standard integrations and public API

Status: ready-for-agent (decided in a grilling session, 2026-10-06)

**Goal:** companies connect to Vink faster, without a developer and without the paid integration service. Exact, AFAS and Twinfield stay with the paid service for now.

Vocabulary: `GLOSSARY.md` (Integration, Webhook, API Key, Subscription). Decisions: [ADR 0008](../../docs/adr/0008-subscriptions-are-webhook-integrations.md), [ADR 0009](../../docs/adr/0009-list-field-rows-in-spreadsheets.md).

## Research (2026-10-06)

Competitors checked: Parseur, Docparser, DocuPipe, Klippa/Doxis, Rossum, Nanonets, Docsumo, Mindee, Extend, and the Dutch invoice tools Basecone, Zenvoices, Blue10, ScanSys and DizzyData.

- Webhook + REST API, and file export (CSV/Excel/JSON): nearly everyone.
- Zapier: 7 of 9 (Klippa unverified); on the homepage at Parseur and Docparser. Make: 6 of 9, often thin. Google Sheets: 4 of 9, mostly native. n8n: 3 of 9 (Parseur, DocuPipe, Mindee).
- Power Automate: official connector only at Parseur; Docparser names it as a platform.
- No international competitor has Exact, AFAS or Twinfield. Every Dutch invoice tool has Exact Online; AFAS and Twinfield nearly all.
- Documents in: email everywhere; then Google Drive, OneDrive, SharePoint, Dropbox.

## Decisions

1. Integration is the umbrella; its kind is Webhook, Google Sheets or Excel. Approval, Delivery, retry and re-send work the same for every kind.
2. Standard integrations are on every Plan, Free Pages too.
3. **API Keys:** several per Organisation, each with a name; made and revoked by an Admin; shown once, stored as a hash.
4. **Public API** (`/v1`):
   - send a Document in: `POST /v1/forms/{form_id}/documents`, with the Intake Address's rules (PDF only, at most 20 pages, enough Pages); a refusal is a clear 4xx;
   - read a Document's state, and its Payload only after Approval; never Field Values before Approval;
   - manage Subscriptions (subscribe / unsubscribe to "Document approved" of one Form) and list Forms with their Fields, for the platforms' dynamic fields.
5. **Subscription** = a Webhook Integration attached to the Form (ADR 0008).
6. **Spreadsheets:** one row per entry of the first List Field (ADR 0009); headers are Field keys plus `document`, `approved_at`, `approved_by`, `delivery_id`; a new Field adds a column on the right.
7. **OAuth:** Vink makes a new sheet / workbook in the customer's Drive or OneDrive (Google scope `drive.file`; Microsoft Graph). Picking an existing file comes later. The docs say Excel may need the IT admin's consent.
8. A connection that loses access makes its Deliveries fail with "access expired"; a "Reconnect" button, then re-send the failed Deliveries.
9. **Power Automate:** a custom connector (OpenAPI file the customer imports) first; certification only on demand. Both need a Premium licence for the customer.
10. **n8n:** no own node for now; guide + Webhook trigger + HTTP node.
11. **Site:** shows only integrations that work, honestly labelled ("Make, via webhook"). No "coming soon".

## Steps

Tickets: `issues/01`–`12` (blocking edges in each file; 01, 02 and 03 can start at once). Each step ships on its own and is proven before the next.

1. **Guides for the existing Webhook** (Make, n8n, Zapier, Power Automate), with the plan each platform needs (Zapier: paid "Webhooks by Zapier"; Power Automate: Premium HTTP trigger; Make, n8n: free). The secret URL is the security there.
   Proof: follow each guide from scratch with a real account against prod and the test account; a test-send and a real Approval arrive.
2. **Public API + API Keys + Subscriptions.**
   Proof: convex tests for keys (hash, revoke, Admin only, tenancy), intake refusals (non-PDF, >20 pages, no Pages, wrong Organisation's Form), Payload hidden before Approval, subscribe/unsubscribe creating and removing the Webhook; an e2e run with curl against dev.
3. **Zapier app** (trigger "Document approved", action "Send in a Document").
   Proof: Zapier CLI tests green; a private Zap moves a real Document end to end; then submit for public listing.
4. **Google Sheets Integration.**
   Proof: convex tests for row building (List entries, no entries, second List as JSON, new Field column); on prod a real Approval adds the right rows; revoke access → Delivery fails "access expired" → reconnect → re-send works.
5. **Make app** (same trigger and action).
   Proof: a real scenario moves a Document end to end; submit for review.
6. **Excel Integration** (OneDrive / SharePoint via Graph).
   Proof: same as step 4, with a Microsoft 365 business tenant, including the admin-consent path.
7. **Power Automate custom connector** (OpenAPI from the API).
   Proof: import into a Premium environment; a flow receives an Approval and sends a Document in.

After each step: update the marketing integrations list (decision 11) and, where the app UI changes, the demo.

## Open checks (need a real account)

- Zapier and Make developer accounts; Google Cloud OAuth consent screen (brand verification); Microsoft Entra app registration (publisher verification); a Power Automate Premium environment.
