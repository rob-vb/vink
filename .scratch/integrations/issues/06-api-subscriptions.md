# 06: API: Subscriptions

**What to build:** an automation platform subscribes with an API Key to "Document approved" of one Form, giving its receiving URL (GLOSSARY: Subscription). That makes a Webhook attached to that Form (ADR 0008), so Approvals reach the platform with Deliveries, retries and signature like any Webhook. Unsubscribing removes that Webhook. In the app, the Integrations list shows such a Webhook as made by a Subscription, with the API Key's name. A sample endpoint returns an example envelope for that Form, so platforms can show fields before the first real Approval.

**Blocked by:** 03

**Status:** done (on integrations, open checks listed)

- [x] `POST /v1/subscriptions` (form_id, url) makes and attaches a Webhook; `DELETE /v1/subscriptions/{id}` removes it
- [x] Revoking the API Key ends its Subscriptions and removes their Webhooks
- [x] A Subscription's Webhook is visible in the app, marked as such; an Admin can still delete it
- [x] `GET /v1/forms/{form_id}/sample` returns an example envelope (the test-send's dummy Payload)
- [x] OpenAPI document and reference updated
- [x] Convex tests: subscribe, unsubscribe, key revoke, Field keys locked while subscribed, tenancy

## Comments

**2026-10-06 (implementer).** What was built:

- Table `subscriptions` (`organisationId, apiKeyId, integrationId, formId`; indexes `by_organisationId`, `by_apiKeyId`, `by_integrationId`). The Integration itself is unchanged: a Subscription's Webhook is an ordinary `kind: "webhook"` row, named after the API Key, with no headers and its own signing secret, linked to the Form by a normal `formIntegrations` row (ADR 0008). The Subscription's `id` on the wire is the `subscriptions` row id.
- `convex/subscriptions.ts`: internal `subscribe`, `unsubscribe`, `sample`, and `endSubscriptionsOf(ctx, apiKeyId)`. They answer a `{ refused: { status, code, message } }` instead of throwing, so the HTTP layer maps it to `apiError`.
- `convex/integrations.ts`: `create` and `remove` now call two exported helpers, `createWebhook(ctx, organisationId, {name, url, headers})` (same https check as the app) and `removeIntegration(ctx, integrationId)`. `removeIntegration` also deletes the Subscription row, so an Admin who deletes the Webhook in the app ends the Subscription. The test-send's dummy branch is now `dummyEnvelope(ctx, form, mode)`, shared with the sample. `list` returns `subscription: { apiKeyName } | null`.
- `apiKeys.revoke` calls `endSubscriptionsOf` first: every Webhook made with that key goes, other keys' Subscriptions and the Admin's own Integrations stay.
- Routes in `convex/publicApi/subscriptions.ts` (`subscriptionsRoutes`), OpenAPI part `convex/publicApi/openapi/subscriptions.ts` (tag "Subscriptions"; schemas `SubscriptionRequest`, `Subscription`, `DeletedSubscription`, `Envelope`; error codes `invalid_request` 400, `too_many_subscriptions` 409, `invalid_url` 422). The reference page renders them from the document.
- Limit: 50 Subscriptions per Organisation (409), so they can't crowd the Admin's own Integrations out of the list (it shows 100).
- Any API Key of the Organisation can unsubscribe a Subscription (tenancy is per Organisation). Only Subscriptions can be deleted through the API: an Admin-made Webhook's id gets 404.
- UI: in the Integrations list a Subscription's Webhook has an outline badge "via API · <key name>" next to its name, and its delete dialog says the platform gets nothing anymore. NL + EN in `messages/{nl,en}/appIntegrations.json`. Nothing else in the dialog or list changed.

Endpoints (snake_case):

```
POST   /v1/subscriptions             {"form_id": "...", "url": "https://..."}
       201 {"id","form_id","url","created_at"}   400 invalid_request · 404 not_found · 409 too_many_subscriptions · 422 invalid_url
DELETE /v1/subscriptions/{id}
       200 {"id","deleted":true}                 404 not_found (also when it already ended)
GET    /v1/forms/{form_id}/sample
       200 the envelope ("test": true, delivery_id "test_…", data with every Field key, a List as an array with one entry)
       404 not_found
```

How it was proven: `convex/subscriptions.test.ts` (12 tests): subscribe answers 201 with the documented shape and the Webhook is listed, attached and marked with the key name; an Approval reaches the subscribed url as a signed Delivery (checked with the Webhook's signing secret); unsubscribe removes it, a second time is 404, an Admin's own Webhook can't be deleted through the API; revoking a key removes only its Subscriptions; Field keys are locked while subscribed and free again after unsubscribing; an Admin deleting the Webhook ends the Subscription; tenancy (another Organisation's Form, Subscription and sample are 404, its list stays empty); 400/422/404 on bad input; the sample equals the test-send's example envelope for the current Form Version; the 51st Subscription is 409; every answer's keys equal its OpenAPI schema. `openapi.test.ts` passes with the new routes. Full suite 413/413, tsc clean, eslint clean on changed files. The reference operations were smoke-rendered with `react-dom/server`; no browser check.

E2E curl against dev (not run here; for the orchestrator). Make a key under Organisation settings → API Keys, and take a Form id from `GET /v1/forms`:

```sh
BASE=https://<dev host>/v1            # or $NEXT_PUBLIC_CONVEX_SITE_URL/v1
KEY=vink_live_...
FORM=$(curl -s "$BASE/forms" -H "Authorization: Bearer $KEY" | jq -r '.data[0].id')

curl -i "$BASE/forms/$FORM/sample" -H "Authorization: Bearer $KEY"              # 200, envelope with "test": true
curl -i -X POST "$BASE/subscriptions" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d "{\"form_id\":\"$FORM\",\"url\":\"https://webhook.site/<your id>\"}"   # 201 {id, form_id, url, created_at}
SUB=<id from the answer>
# In the app: Integrations shows the Webhook with "via API · <key name>", attached to the Form; the Form editor shows keys locked.
# Approve a Document of that Form: webhook.site receives the envelope with X-Vink-Signature.
curl -i -X DELETE "$BASE/subscriptions/$SUB" -H "Authorization: Bearer $KEY"   # 200 {"id":"...","deleted":true}
curl -i -X DELETE "$BASE/subscriptions/$SUB" -H "Authorization: Bearer $KEY"   # 404 not_found
curl -i -X POST "$BASE/subscriptions" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d "{\"form_id\":\"$FORM\",\"url\":\"http://example.com\"}"     # 422 invalid_url
curl -i -X POST "$BASE/subscriptions" -H "Authorization: Bearer $KEY" -d 'nope'   # 400 invalid_request
curl -i "$BASE/forms/nope/sample" -H "Authorization: Bearer $KEY"                  # 404 not_found
# Subscribe again, then revoke the key in the app: the Webhook is gone from Integrations.
```

Open checks:
- The e2e curl above on dev, and a visual check of the badge and delete dialog on the Integrations page.
- Real-account checks belong to tickets 07, 10 and 12: Zapier REST hook, Make instant trigger and Power Automate webhook trigger calling these endpoints. They must treat a 404 on unsubscribe as done (the Webhook was already deleted in Vink).


**2026-10-06 (review fixes, `int/13-review-fixes`):** `DELETE /v1/subscriptions/{id}` is now idempotent: 200 `{id, deleted: true}` also for a Subscription that is gone already, an unknown id, an Admin's own Webhook's id or another Organisation's Subscription; only the caller's Organisation's own Subscription is ended. Reason: Make treats every 4xx on detach as an error (its 404 showed an error after an Admin deleted the Webhook). The OpenAPI operation drops its 404 and says so; the Power Automate files are regenerated. Also new: a `410 Gone` from a Subscription's `url` ends that Subscription (its Webhook is removed as an unsubscribe does) and fails the Delivery without the Admin notice; a 410 from an Admin's own Webhook fails as any refusal. Proof: `convex/subscriptions.test.ts` (unsubscribe, delete-in-app and tenancy tests now expect 200; two new 410 tests). Zapier still tolerates a 404 (older behaviour), unchanged.

**2026-10-07 (orchestrator), e2e against dev.** Subscribe gives 201 with `Location`; `http://` gives 422; another Organisation's key gets 404 on subscribe and 200 on delete, and the Subscription stays (checked in the table). Unsubscribing twice gives 200 both times and removes the Webhook. In the app the Webhook shows "via API · Zapier" without the detach control; revoking the key removes it. Sample and schema endpoints answer for the own Form, 404 for a foreign one.
