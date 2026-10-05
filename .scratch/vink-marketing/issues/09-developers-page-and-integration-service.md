# Developers page and integration service

Type: grilling
Status: resolved
Blocked by: 06

## Question

What does the Developers page contain and how is Vink's paid integration service offered? Settle: what developers see (Payload envelope example, HMAC signature verification, retries and at-least-once delivery, test-send, any public API docs), whether the integration service shows a price or starting price, what a visitor submits to request it, and where that request goes.

## Answer

Settled on 2026-09-30.

**Page shape.** One page at `/developers` (and `/nl/developers`: prose in Dutch, code, keys and header names in English) with anchor sections: Overview → Envelope → Verify the signature → Delivery and retries → Test-send → Integration service. No separate docs area.

**Technical content** (it describes what the app does today, see `convex/lib/payload.ts`, `signing.ts`, `backoff.ts`, `deliveries.ts`):
- An annotated envelope example (`event: "document.approved"`, `deliveryId`, `test`, `document`, `form`, `approval`, `data`) built from a demo Form, never tyres. Rules: every key is always present, `null` means no value, `[]` means a List without entries.
- Signature verification snippets in Node, Python and PHP, each with a constant-time compare and the timestamp check.
- Delivery: `POST`, 15 s timeout. 2xx means delivered. A timeout, network error, 408, 429 or 5xx is retried at about 1m, 5m, 30m, 2h and 6h (6 attempts, ~8 h), with `Retry-After` honoured up to 24 h. Any other 4xx fails right away, and a failed Delivery can be sent again by hand. Delivery is at-least-once, so receivers deduplicate on `deliveryId`.
- Custom headers (including secret ones). Vink sets `Content-Type` and the signature header itself.
- Test-send with example or empty data. It carries `test: true` and is never a Delivery.
- One factual line: "reads with Gemini on Vertex AI, EU region" (from Positioning and messaging).
- Two app screenshots with demo data, in light and dark: the Integration setup with a test-send result, and a Document's Delivery status showing a retry.
- Inbound: "Documents come in through the app today. Need an upload API or email-in? Tell us", linking to the request form. No "coming soon" promise.

**App change before launch: timestamped signature.** Today `X-Vink-Signature: sha256=<hex>` covers only the body, so a captured request can be replayed. Before the format is published it changes to `X-Vink-Signature: t=<unix>,v1=<hex>`, an HMAC-SHA256 over `"{t}.{rawBody}"` with the same `whsec_` secret. The documented tolerance is 5 minutes. The header name stays; `v1` leaves room for a later scheme or rotation (multiple `v1=` values during rotation is a later extension, not v1).

**Integration service.** A paid, one-off build that is never part of a Plan. We write the receiver that takes the Payload into the customer's system (ERP, accounting package, spreadsheet, database) and sets up the Form(s) with them. The customer hosts it, or we host it for a monthly fee on request. Maintenance and changes are billed per job. Price shown: **"From €950 per connection, excl. VAT"**.

**Request form.** A short form on Developers: name, work email, company, "Which system should it land in?", "What documents?", rough pages per month, and an optional note. The general Contact page uses the same form component with fewer fields, which settles the map's "Contact handling" fog. Submissions:
- are emailed through the app's existing Resend (EU) sender to one address in config (`CONTACT_TO`), with `Reply-To` set to the visitor, and are **not stored**. The privacy policy only needs "contact requests are emailed to us".
- are protected by a honeypot, a rate limit (about 5 an hour per IP) and server-side email validation. No reCAPTCHA (it would need consent); Turnstile only if spam appears.
