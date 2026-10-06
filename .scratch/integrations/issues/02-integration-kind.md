# 02: Integration kind (prefactor)

**What to build:** every Integration has a kind, and a Delivery is sent through the adapter for that kind (GLOSSARY: Integration, Webhook). Today the only kind is Webhook; all existing Integrations become Webhooks. Nothing changes for the user: same list, same dialog, same Deliveries, retries, re-send and test-send. This makes adding Google Sheets and Excel (08, 11) a matter of adding an adapter.

**Blocked by:** None (can start immediately).

**Status:** done (on integrations, open checks listed)

- [x] Integrations carry a kind; existing ones are Webhooks (expand first: an absent kind reads as Webhook, then backfill)
- [x] A Delivery attempt and a test-send go through the kind's adapter; the Webhook adapter does what the code does today (signing, headers, outcome rules)
- [x] An adapter reports delivered, retry (with reason, retry-after) or failed (with reason), so the Delivery log works for every kind
- [x] All existing convex tests pass unchanged; a test proves an unknown kind can't be sent

## Comments

**2026-10-06 (implementer):** Built on `int/02-integration-kind`.

- Schema: `integrations` is now a union with one member per kind. The Webhook member has `kind: v.optional(v.literal("webhook"))` (expand step: absent reads as Webhook through `kindOf`). New Integrations are made with `kind: "webhook"`. `integrations.list` also returns `kind` (the UI ignores it for now).
- Adapters: `convex/lib/integrationAdapters.ts` has the `IntegrationAdapter<K>` type, the `Outcome` (delivered / retry with reason and retry-after / failed with reason), `SendResult` (outcome plus the status, body and error for the log), the registry, `adapterFor` and `sendTo`. `convex/lib/webhookAdapter.ts` is the Webhook adapter: the old `endpointOf`, `sendSigned` and outcome rules moved there unchanged. A Delivery attempt (`deliveries.attempt`) and a test-send (`integrations.testSend`) both call `sendTo`; `recordAttempt` now takes the adapter's Outcome.
- Backfill: `integrations.backfillKind` (internal mutation, idempotent, returns `{ filled }`).
- Proof: all existing convex tests pass unchanged. New tests: a new Integration is a Webhook; one without a kind is listed as a Webhook and the backfill stores it (second run fills 0); one without a kind is still sent to as a signed Webhook; an unknown kind can't be sent (`convex/lib/integrationAdapters.test.ts`).

**To do after deploy (needs a person with Convex access):** run the backfill once on each deployment:

```
npx convex run integrations:backfillKind
npx convex run --prod integrations:backfillKind
```

After both runs, a later change can make `kind` required (the contract step).

Open checks (real account): none for this ticket. Real webhook sends are covered by ticket 01's guides.
