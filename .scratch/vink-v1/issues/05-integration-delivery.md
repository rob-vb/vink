# Delivering a Payload to an Integration

Type: grilling
Status: resolved
Blocked by: 

## Question

How is an Integration configured and how is a Payload delivered? Endpoint URL, auth (static headers / API key / basic), exact JSON envelope (metadata like Document id, Form id, confidences?), retries and backoff, failure states visible to the user, a test-send, and whether one Form can have several Integrations.

## Answer

Settled with the user on 2026-09-23. The new term **Delivery** is recorded in `CONTEXT.md`, and Integration and Approval are sharpened there.

- **Ownership:** an Integration belongs to the tenant and is attached to one or more Forms. A Form can have several Integrations. One Approval sends the Payload to every Integration attached to the Form. A Field's key is fixed once any Integration is attached, as before.
- **Auth:** free static headers cover API key, Bearer and Basic. Secret values are stored encrypted and masked in the UI. Every request is also signed with HMAC-SHA256 over the body, using a secret per Integration. OAuth2 comes later.
- **Envelope:**
  ```json
  {
    "event": "document.approved",
    "deliveryId": "…",
    "test": false,
    "document": { "id": "…", "filename": "…", "uploadedAt": "…" },
    "form": { "id": "…", "version": 3 },
    "approval": { "mode": "manual" | "auto", "by": "<user id or null>", "at": "…" },
    "data": { /* the Payload, keyed by the Form's Fields */ }
  }
  ```
  Confidences and read text are left out. There is no link to the PDF in v1.
- **Success and retries:** a delivery succeeds on any 2xx within 15 s. Timeouts, network errors, 408, 429 and 5xx are retried with exponential backoff plus jitter (about 1m, 5m, 30m, 2h, 6h, roughly 8h in total), and `Retry-After` is honoured. Any other 4xx fails at once. Every attempt carries the same `deliveryId`, so delivery is at-least-once and the receiver can dedupe.
- **Delivery states:** there is one Delivery per Document per Integration, moving `pending` → `delivered` | `retrying` | `failed`. A log per attempt (time, status code, the start of the response body) is visible on both the Document and the Integration. A `failed` Delivery can be sent again by hand: the same Payload and `deliveryId`, freshly signed. An in-app notification appears on `failed`. Email notifications come later.
- **After a correction:** a Document that has already been sent is never re-sent automatically. In v1, sent means done.
- **Test-send:** by default it sends a Payload with dummy values generated from the Form definition, marked `"test": true`. Optionally the user picks a processed Document instead. The response is shown in the UI. A test-send is never a Delivery.
- **Form without an Integration:** a Document can still be approved, manually or through Auto-Send. No Delivery is created. Attaching an Integration later does not back-send Documents that were already approved.
- **Changing an Integration mid-retry:** every retry uses the Integration's current configuration, so a fix to the URL or auth takes effect on the next attempt. Detaching or deleting the Integration moves its open Deliveries to `failed` with the reason "Integration removed", and those can't be re-sent.

No ADR was written. None of these calls is hard to reverse.
