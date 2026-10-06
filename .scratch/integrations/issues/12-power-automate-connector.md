# 12: Power Automate custom connector

**What to build:** a Power Automate user imports Vink's custom connector file, connects with an API Key, and builds a flow with the trigger "When a Document is approved" (webhook trigger via Subscriptions, pick a Form) and the action "Send in a Document". The Developers page explains the import and that it needs a Premium licence. Certification by Microsoft only when customers ask for it.

**Blocked by:** 04, 06

**Status:** ready-for-agent

- [ ] Connector definition built from the OpenAPI document, with API Key auth, the webhook trigger and the action
- [ ] Downloadable from the Developers page, with an import guide (NL and EN)
- [ ] Open checks (real accounts): import into a Premium environment; a flow receives an Approval and sends in a Document
