# 06: API: Subscriptions

**What to build:** an automation platform subscribes with an API Key to "Document approved" of one Form, giving its receiving URL (GLOSSARY: Subscription). That makes a Webhook attached to that Form (ADR 0008), so Approvals reach the platform with Deliveries, retries and signature like any Webhook. Unsubscribing removes that Webhook. In the app, the Integrations list shows such a Webhook as made by a Subscription, with the API Key's name. A sample endpoint returns an example envelope for that Form, so platforms can show fields before the first real Approval.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] `POST /v1/subscriptions` (form_id, url) makes and attaches a Webhook; `DELETE /v1/subscriptions/{id}` removes it
- [ ] Revoking the API Key ends its Subscriptions and removes their Webhooks
- [ ] A Subscription's Webhook is visible in the app, marked as such; an Admin can still delete it
- [ ] `GET /v1/forms/{form_id}/sample` returns an example envelope (the test-send's dummy Payload)
- [ ] OpenAPI document and reference updated
- [ ] Convex tests: subscribe, unsubscribe, key revoke, Field keys locked while subscribed, tenancy
