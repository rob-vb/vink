# 03: API Keys and the first endpoint

**What to build:** an Admin makes an API Key (GLOSSARY: API Key) with a name, sees it once, and can revoke it without touching other keys. A program calls `GET /v1/forms` with the key and gets the Organisation's Forms with their current Fields (key, label, type, required, List sub-Fields), snake_case on the wire (ADR 0005). This is the tracer bullet for the public API: auth, tenancy, error shape, versioning and the reference docs all exist after this ticket.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Admin-only UI to make, name, list (name, created, last used) and revoke API Keys; a Member can't see or make them
- [ ] A key is stored only as a hash; it is shown once, at creation
- [ ] `Authorization: Bearer <key>`; a missing, unknown or revoked key gets 401 with a JSON error body
- [ ] `GET /v1/forms` returns only the key's own Organisation's Forms (tenancy test)
- [ ] An OpenAPI document for `/v1`, and an API reference on the Developers page generated from or matching it
- [ ] Convex tests: hash, revoke, Admin only, tenancy, error shape; an e2e call with curl against dev
