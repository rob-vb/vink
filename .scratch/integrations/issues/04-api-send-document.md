# 04: API: send a Document in

**What to build:** a program sends a PDF to `POST /v1/forms/{form_id}/documents` with an API Key, and it becomes a Document of that Form, exactly as if it had been emailed to the Form's Intake Address: same processing, same Pages counting, same notifications. Because the caller waits for an answer, a refusal is a clear 4xx instead of silence: not a PDF, over 20 pages, not enough Pages, or a Form that isn't the key's Organisation's. A success returns the Document's id and state.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Upload and Intake Address share one path for accepting a PDF into a Form; the API uses it too
- [ ] Refusals: 415 not a PDF, 413/422 over 20 pages, 402 out of Pages, 404 unknown or foreign Form; each with a JSON error body
- [ ] The Document shows in the app like any other, with the API Key's name as its source
- [ ] OpenAPI document and reference updated
- [ ] Convex tests for each refusal and for Pages counting once; an e2e upload with curl against dev
