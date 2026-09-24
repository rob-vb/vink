# 35 — Delivery retries and recovery

Type: task
Status: ready-for-agent
Blocked by: 34

## What to build

A timeout, network error, 408, 429 or 5xx is retried through the Convex scheduler with exponential backoff and jitter (about 1m, 5m, 30m, 2h, 6h, roughly 8h in total), honouring `Retry-After`. The Delivery shows `retrying` in the meantime. Every attempt uses the same `deliveryId` and is freshly signed with the Integration's current URL and headers, so fixes take effect on the next retry. When a Delivery ends `failed`, the Admins get an in-app **Notification**. An Admin can re-send a failed Delivery by hand with the same `deliveryId`. Detaching or deleting an Integration fails its open Deliveries with "Integration removed", and those can't be re-sent. Attaching an Integration later never back-sends old Documents.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for in-app notifications and retry or resend actions. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] Retryable responses are retried on the backoff schedule, and `Retry-After` is honoured (tested with a fake clock)
- [ ] After the last attempt the Delivery is failed, and Admins see an in-app notification
- [ ] A manual re-send reuses the `deliveryId` and signs with the current configuration
- [ ] A URL or header fix is used by the next retry
- [ ] Detaching or deleting fails open Deliveries with "Integration removed", and these can't be re-sent
- [ ] Attaching an Integration later creates no Deliveries for Documents approved before
- [ ] `convex-test` covers every rule above
