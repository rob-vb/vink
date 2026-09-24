# 34 — Delivery on Approval

Type: task
Status: ready-for-agent
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

- [ ] Approval creates one Delivery per attached Integration, and none when nothing is attached
- [ ] The envelope and the Payload match the spec: every key present, `null`, `[]`, ISO dates and choice values
- [ ] The signature verifies against the raw body with the Integration's secret
- [ ] 2xx means delivered, and a non-retryable 4xx means failed at once
- [ ] Delivery state and attempt log are visible on both the Document and the Integration
- [ ] `convex-test` with faked outbound HTTP covers all of the above, including Payloads for List Fields
