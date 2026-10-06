# 02: Integration kind (prefactor)

**What to build:** every Integration has a kind, and a Delivery is sent through the adapter for that kind (GLOSSARY: Integration, Webhook). Today the only kind is Webhook; all existing Integrations become Webhooks. Nothing changes for the user: same list, same dialog, same Deliveries, retries, re-send and test-send. This makes adding Google Sheets and Excel (08, 11) a matter of adding an adapter.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Integrations carry a kind; existing ones are Webhooks (expand first: an absent kind reads as Webhook, then backfill)
- [ ] A Delivery attempt and a test-send go through the kind's adapter; the Webhook adapter does what the code does today (signing, headers, outcome rules)
- [ ] An adapter reports delivered, retry (with reason, retry-after) or failed (with reason), so the Delivery log works for every kind
- [ ] All existing convex tests pass unchanged; a test proves an unknown kind can't be sent
