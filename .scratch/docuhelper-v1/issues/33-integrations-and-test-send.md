# 33 — Integrations and test-send

Type: task
Status: ready-for-agent
Blocked by: 20

## What to build

An Admin creates an **Integration** with a name, an endpoint URL and free static headers (API key, Bearer, Basic). Header secret values are stored encrypted and shown masked. Each Integration gets its own HMAC-SHA256 secret, which the Admin can view to set up their receiver. An Integration can be attached to several Forms, and a Form to several Integrations. Once any Integration is attached to a Form, that Form's Field keys are locked. A test-send posts the envelope with `"test": true`, and dummy `data` generated from the Form Version or, optionally, a chosen processed Document. It is signed like a real Delivery, and the response is shown inline. A test-send is not a Delivery. Only an Admin can manage Integrations.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for integration or webhook settings, secret fields and a send-test panel. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] An Admin can create, edit, delete, attach and detach Integrations. A Member can't
- [ ] Header secrets are encrypted at rest and masked in the UI
- [ ] Keys become read-only in the Form editor once an Integration is attached, and the backend refuses a key change
- [ ] A test-send with dummy data covers every Field type, including `null` and `[]`, is signed, and shows the status and body inline
- [ ] A test-send with a chosen processed Document uses that Document's Payload
- [ ] `convex-test` with faked outbound HTTP covers the signature, the encryption round trip and the key lock
