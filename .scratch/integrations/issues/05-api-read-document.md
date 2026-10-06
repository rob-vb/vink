# 05: API: read a Document's state and Payload

**What to build:** a program calls `GET /v1/documents/{id}` with an API Key and gets the Document's state (processing, needs review, approved, rejected, failed). After Approval the answer also holds the Payload in the same envelope a Webhook gets. Before Approval it never holds Field Values, so "nothing is sent without approval" holds for the API too.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] State for every Document state; the Payload only after Approval
- [ ] A Document whose data was deleted (retention, delete now) answers with its state and no Payload
- [ ] 404 for another Organisation's Document (tenancy test)
- [ ] OpenAPI document and reference updated
- [ ] Convex tests: Payload hidden before Approval, shown after, gone after deletion
