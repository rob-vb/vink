# 35 — Delivery retries and recovery

Type: task
Status: resolved
Blocked by: 34

## What to build

A timeout, network error, 408, 429 or 5xx is retried through the Convex scheduler with exponential backoff and jitter (about 1m, 5m, 30m, 2h, 6h, roughly 8h in total), honouring `Retry-After`. The Delivery shows `retrying` in the meantime. Every attempt uses the same `deliveryId` and is freshly signed with the Integration's current URL and headers, so fixes take effect on the next retry. When a Delivery ends `failed`, the Admins get an in-app **Notification**. An Admin can re-send a failed Delivery by hand with the same `deliveryId`. Detaching or deleting an Integration fails its open Deliveries with "Integration removed", and those can't be re-sent. Attaching an Integration later never back-sends old Documents.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for in-app notifications and retry or resend actions. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] Retryable responses are retried on the backoff schedule, and `Retry-After` is honoured (tested with a fake clock)
- [x] After the last attempt the Delivery is failed, and Admins see an in-app notification
- [x] A manual re-send reuses the `deliveryId` and signs with the current configuration
- [x] A URL or header fix is used by the next retry
- [x] Detaching or deleting fails open Deliveries with "Integration removed", and these can't be re-sent
- [x] Attaching an Integration later creates no Deliveries for Documents approved before
- [x] `convex-test` covers every rule above

## Comments

- 2026-09-24 — Built on branch `ticket-35-delivery-retries` (stacked on `ticket-34-delivery`). `lib/backoff.ts`: a series is 6 attempts, with retries after 1m, 5m, 30m, 2h and 6h, each plus 0–10% jitter (about 8.6 h in all). A `Retry-After` (in seconds or as an HTTP date, capped at 24 h) wins when it is longer than the step. In `deliveries.recordAttempt`, a timeout, network error, 408, 429 or 5xx sets `retrying` with `nextAttemptAt` and schedules the next `attempt` with `runAt`. After the 6th attempt the Delivery is `failed` ("Gave up after 6 attempts: …"). Each attempt reads the Integration's current URL, headers and secret, so fixes apply to the next try. Any final failure, including an immediate 4xx, adds an in-app notification for the Organisation's Admins (`notifications` table; `notifications.list`, `unreadCount`, `markAllRead`, all Admin-only, read state per Admin).
- `deliveries.resend` (Admin, only `failed`) starts a new series (`seriesStart`) with the same `deliveryId`. Detaching an Integration from a Form fails that Form's open Deliveries to it, and deleting an Integration fails all of its open ones. Both use "Integration removed" and set `integrationRemoved`, which blocks a re-send. A scheduled attempt for such a Delivery does nothing. Attaching later creates nothing for Documents approved before, since Deliveries are only created at Approval.
- UI: "Send again" on a failed Delivery (review screen for Admins, and the Integration card). A retrying Delivery shows its reason and the next try's time. There's a bell in the header for Admins with an unread count and a popover with "Mark all as read", each notification linking to its Document. Mobbin references: [Klaviyo notifications](https://mobbin.com/screens/3d7c4bf5-dcfa-4e4f-b739-3015c2a4ab96) (a bell with a count, a dropdown with unread dots and "Mark all as read") and [Customer.io Deliveries](https://mobbin.com/screens/a8864bb7-9782-4887-8725-e93cc187970a) ("Retrying soon" per row).
- Tests: `convex/deliveryRetries.test.ts` with a fake clock covers a 503 retried after about 1 minute with the same `deliveryId` and a valid fresh signature, the whole schedule (each gap within +10%, more than 8 h in all, 6 requests, the final reason, the Admin notification, a Member refused), `Retry-After` in seconds and as a date, timeout/network/408 retried, a URL and header fix used on the next retry, a manual re-send (same `deliveryId`, current URL, refused once delivered, Admin only), detach and delete failing open Deliveries with "Integration removed" and no re-send, no back-send after a later attach, and marking notifications read.
- Checked on dev: "Send again" on the Delivery to example.com made a second signed attempt with the same `deliveryId` (405 again). It failed, and the bell showed "werkorder-schoon.pdf couldn't be delivered to Example receiver".
