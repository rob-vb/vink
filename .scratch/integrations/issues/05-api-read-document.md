# 05: API: read a Document's state and Payload

**What to build:** a program calls `GET /v1/documents/{id}` with an API Key and gets the Document's state (processing, needs review, approved, rejected, failed). After Approval the answer also holds the Payload in the same envelope a Webhook gets. Before Approval it never holds Field Values, so "nothing is sent without approval" holds for the API too.

**Blocked by:** 03

**Status:** done (on integrations, open checks listed)

- [x] State for every Document state; the Payload only after Approval
- [x] A Document whose data was deleted (retention, delete now) answers with its state and no Payload
- [x] 404 for another Organisation's Document (tenancy test)
- [x] OpenAPI document and reference updated
- [x] Convex tests: Payload hidden before Approval, shown after, gone after deletion

## Comments

**2026-10-06 (implementer).** What was built:

- `GET /v1/documents/{id}` in `convex/publicApi/documentRead.ts` (`documentReadRoutes`, internal query `publicApi.documentRead.read`). Another Organisation's Document, or an id that isn't a Document, gets 404 `not_found` (same code and message for both).
- Answer (snake_case):
  ```
  { "id", "form_id", "state", "filename", "uploaded_at", "data_deleted_at": <ISO>|null, "payload": <Envelope>|null }
  ```
  `state` is one of `processing` (extracting), `needs_review`, `approved`, `rejected`, `failed` (extraction_failed), `deleted` (data deleted before Approval). Ticket 04's `POST` answers `processing` too.
- `payload` is only set when the state is `approved` and the data is still kept. It is built with `envelopeOf` + `documentPayload`, the same builders a Delivery uses, so it equals what a Webhook got. The only difference: `delivery_id` is `doc_<document id>` (there is no Delivery; it is the same on every read) and `test` is `false`. Before Approval no Field Value, key or List is in the answer. After delete now or Retention, `payload` is `null`, `data_deleted_at` says when, and the state stays `approved` (or becomes `deleted` for a non-approved Document, as the app does).
- OpenAPI: part `convex/publicApi/openapi/documentRead.ts`, tag "Documents" (same name and description as ticket 04's part), schema `Document` with the state enum; `payload` is `oneOf: [Envelope, null]`, reusing 06's `Envelope` schema. The Envelope's `delivery_id` description now names `doc_…`. `openapi/index.ts` lists a tag once when two parts share it (04 and 05 both use "Documents"). The reference page's `TypeLabel` renders `oneOf` as `Envelope | null`.

How it was proven: `convex/publicApi/documentRead.test.ts` (8 tests): `processing` without Payload; Needs Review answers its state with no Field Value, key or List anywhere in the body, and after Approval the full envelope; the Payload equals the envelope an attached Webhook received, apart from `delivery_id`; delete now (approved stays `approved` without Payload, Needs Review becomes `deleted`); Retention (same); `rejected` and `failed` without Payload; tenancy (another Organisation's Document, a nonsense id and a Form id are 404; no key is 401); every answer has exactly the `Document` schema's keys and the Payload exactly the `Envelope`'s. The two guards (Approval, data deleted) were each broken once to see their tests fail. `openapi.test.ts` passes. Full suite 459/459 after merging ticket 04, tsc clean, eslint clean on changed files. The `Document` property table was smoke-rendered with `react-dom/server`; no browser check.

E2E curl against dev (not run here; for the orchestrator). Dev has no R2, so a Document sent in through the API may fail at the PDF read; use Documents that already exist in the dev app (one in Needs Review, one approved, one deleted with "Delete now"), and take their ids from the app's Document URL:

```sh
BASE=https://<dev host>/v1            # or $NEXT_PUBLIC_CONVEX_SITE_URL/v1
KEY=vink_live_...                     # Organisation settings → API Keys

curl -s "$BASE/documents/<needs-review id>" -H "Authorization: Bearer $KEY" | jq   # 200, "state":"needs_review", "payload":null, no values
curl -s "$BASE/documents/<approved id>"     -H "Authorization: Bearer $KEY" | jq   # 200, "state":"approved", payload = envelope, delivery_id "doc_<id>"
curl -s "$BASE/documents/<deleted id>"      -H "Authorization: Bearer $KEY" | jq   # 200, data_deleted_at set, "payload":null
curl -i "$BASE/documents/nonsense"          -H "Authorization: Bearer $KEY"        # 404 not_found
curl -i "$BASE/documents/<approved id>"                                            # 401 missing_api_key
# Tenancy: a key from a second Organisation gets 404 not_found for these ids.
# With ticket 04 (merged): POST a PDF, then GET its id: "processing", later "needs_review" or "failed".
```

Open checks:
- The e2e curl above on dev, and a look at the "Documents" section of `/developers/api` in a browser (one section with both operations).
- No real-account checks for this ticket. The Zapier, Make and Power Automate apps (07, 10, 12) read this shape; Power Automate's Swagger 2.0 import may need `payload`'s `oneOf` flattened to a plain `Envelope` ref.
