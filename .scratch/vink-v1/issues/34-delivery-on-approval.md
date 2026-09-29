# 34 — Delivery on Approval

Type: task
Status: resolved
Blocked by: 25, 27, 33

## What to build

Approval (manual or automatic) creates one **Delivery** per Integration attached to the Form at that moment, each with a stable `deliveryId`. The Delivery POSTs the envelope (`event`, `deliveryId`, `test`, `document`, `form`, `approval`, `data`). The **Payload** in `data` has every key of the Form Version:
- `null` for no value;
- a List Field as an array of objects keyed by sub-Field keys, or `[]`;
- ISO dates, and a choice as its option value;
- never confidences, read text, the Reading or a PDF link.

The request carries the HMAC-SHA256 signature over the raw body next to the static headers. Any 2xx within 15 s means delivered, and any 4xx other than 408 and 429 fails at once. Retries come in ticket 35. A Delivery's state (`pending → delivered | failed`) and its attempt log (time, status code, the start of the response body) show on the Document and on the Integration. A correction after sending is never re-sent.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for delivery status indicators and request or attempt logs. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] Approval creates one Delivery per attached Integration, and none when nothing is attached
- [x] The envelope and the Payload match the spec: every key present, `null`, `[]`, ISO dates and choice values
- [x] The signature verifies against the raw body with the Integration's secret
- [x] 2xx means delivered, and a non-retryable 4xx means failed at once
- [x] Delivery state and attempt log are visible on both the Document and the Integration
- [x] `convex-test` with faked outbound HTTP covers all of the above, including Payloads for List Fields

## Comments

- 2026-09-24 — Built on branch `ticket-34-delivery` (stacked on `ticket-33-integrations`). `review.approve` now calls `createDeliveries` (`convex/deliveries.ts`), which inserts one `deliveries` row per Integration attached to the Form at that moment. Each row has a stable `deliveryId` (`dlv_<uuid>`), the Integration's name kept for the log, and the envelope frozen as JSON at Approval (`lib/payload.ts`, `lib/documentPayload.ts` from ticket 33). It then schedules `deliveries.attempt`. Each attempt reads the Integration's current URL, headers and secret, signs the raw body (`X-Vink-Signature: sha256=…`), posts through `lib/http.ts`, and records the time, status code, the first 500 characters of the body, or the error. A 2xx means `delivered`. Any other 4xx fails at once ("The receiver refused it (422)"). In this ticket a timeout, network error, 408, 429 or 5xx also fails. Retries come in ticket 35 and plug into the same `recordAttempt`. With no Integration attached, nothing is created. An approved Document can't be corrected (ticket 27), so nothing is re-sent after a correction.
- The frozen envelope counts as the Payload for retention (ticket 38 removes it with the Document's data).
- UI: a shared `components/deliveries/delivery-log.tsx` (a shadcn Collapsible per Delivery with a state badge, the reason, the `deliveryId`, and each attempt's time, status badge and body start). It appears as "Deliveries" on the review screen and as "Recent Deliveries" (last 50, linking to the Document) on each Integration card (`deliveries.forIntegration`, Admin only). Mobbin references: [Customer.io Deliveries](https://mobbin.com/screens/a8864bb7-9782-4887-8725-e93cc187970a) (plain state per row such as "Retrying soon"/"Failed", expandable rows) and [Supabase edge function invocations](https://mobbin.com/screens/b5dc05f0-1a81-475b-ac38-9b852445ef52) (time, a status-code badge, the request id).
- Tests: `convex/deliveries.test.ts` with faked outbound HTTP covers no Delivery without an Integration, one per Integration with its own `deliveryId`, the full envelope (every key, `null`, `[]` for an empty List, a List entry object, ISO dates, choice values, nothing else), the signature checked with Node's `createHmac` next to the static headers, 2xx delivered with the attempt log, 422 failing at once after one request, and the Integration's list.
- Checked on dev: approving a seeded Document whose Form is attached to an Integration pointing at `https://example.com/` sent a real signed POST. It came back 405, so the Delivery showed Failed with the attempt and the body on the review screen and on the Integration card.
