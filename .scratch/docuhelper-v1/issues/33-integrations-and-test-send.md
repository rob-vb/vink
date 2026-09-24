# 33 — Integrations and test-send

Type: task
Status: resolved
Blocked by: 20

## What to build

An Admin creates an **Integration** with a name, an endpoint URL and free static headers (API key, Bearer, Basic). Header secret values are stored encrypted and shown masked. Each Integration gets its own HMAC-SHA256 secret, which the Admin can view to set up their receiver. An Integration can be attached to several Forms, and a Form to several Integrations. Once any Integration is attached to a Form, that Form's Field keys are locked. A test-send posts the envelope with `"test": true`, and dummy `data` generated from the Form Version or, optionally, a chosen processed Document. It is signed like a real Delivery, and the response is shown inline. A test-send is not a Delivery. Only an Admin can manage Integrations.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for integration or webhook settings, secret fields and a send-test panel. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] An Admin can create, edit, delete, attach and detach Integrations. A Member can't
- [x] Header secrets are encrypted at rest and masked in the UI
- [x] Keys become read-only in the Form editor once an Integration is attached, and the backend refuses a key change
- [x] A test-send with dummy data covers every Field type, including `null` and `[]`, is signed, and shows the status and body inline
- [x] A test-send with a chosen processed Document uses that Document's Payload
- [x] `convex-test` with faked outbound HTTP covers the signature, the encryption round trip and the key lock

## Comments

- 2026-09-24 — Built on branch `ticket-33-integrations` (stacked on `ticket-30-change-form`). New tables `integrations` (name, https URL, static headers, encrypted signing secret) and `formIntegrations` (many-to-many). `convex/integrations.ts` (all Admin-only) has `list` (secret headers masked as `••••••••` plus the last 4 characters), `signingSecret` (reveal), `create`, `update` (a secret header sent with `value: null` keeps its stored value), `remove` (detaches too), `attach`/`detach`, `testDocuments` and `testSend`. `lib/secrets.ts` encrypts header secrets and the signing secret with AES-256-GCM under `INTEGRATION_SECRETS_KEY`. `lib/signing.ts` signs with HMAC-SHA256 over the raw body in `X-DocuHelper-Signature: sha256=<hex>`. `lib/payload.ts` builds the Payload (every key, `null`, `[]`), the dummy data and the envelope. `lib/documentPayload.ts` builds a Document's Payload from its stored values (corrections included, removed entries left out). `lib/http.ts` is the outbound adapter (15 s timeout, no redirects, the first 2000 characters of the body kept). Ticket 34 reuses all of these.
- Key lock: `forms.save` refuses to drop or rename any key (or sub-Field key, or turn a List into another type) while an Integration is attached. Adding Fields and changing labels still work. `forms.get` returns `keysLocked`, and the editor makes those keys read-only and disables Remove.
- Dummy data: each Field gets an example of its type. "Optional values empty" leaves every optional value `null` and every optional List `[]`, so the receiver sees both. A test-send can also use a processed Document of that Form (Needs Review or Approved). It's marked `"test": true`, signed like a Delivery, and never stored.
- UI: a new "Integrations" page (Admin nav) with a card per Integration showing the URL, masked headers, signing secret (Reveal/Copy), attached Forms as badges (× to detach, a select to attach), and "Send test", a dialog with the Form, the data source, the example/empty toggle, and the response status and body inline. The create/edit dialog has name/value header rows with a Secret switch ("Unchanged" placeholder for stored secrets). Mobbin references: [Plain request headers](https://mobbin.com/screens/29d15630-e62e-4283-aef3-c6587d3f9c2b) (name/value rows with "Add header"), [Railway test webhook](https://mobbin.com/screens/ba11240f-2315-4b4f-9e94-483e2751e677) (the response status shown inline) and [Toggl webhook secret](https://mobbin.com/screens/ddc1263f-be44-4873-a46f-cb6bce066567) (a reveal toggle on the secret).
- Tests: unit seams `lib/signing.test.ts` (against Node's own `createHmac`), `lib/secrets.test.ts` (round trip, a fresh IV each time, tamper detection, missing key) and `lib/payload.test.ts` (every key, `null`, `[]`, dummy data in both modes, the envelope). Seam 1 `convex/integrations.test.ts` with faked outbound HTTP covers create (masked, and not stored in plain text), reveal, edit keeping or replacing secrets, validation, attach/detach to several Forms, Member refusals, tenancy, the key lock and its release, test-send (headers, signature checked with `createHmac`, envelope, status and body), empty mode, a chosen Document's Payload with a correction, an error answer and an unreachable receiver, and delete detaching.
- Dev: I set a fresh random `INTEGRATION_SECRETS_KEY` on the dev deployment only. Checked in headless Chrome: I created an Integration with a secret header, attached it to a Form, revealed the secret, and sent a test to `https://example.com/` (a 405 and the body shown inline). The Form editor showed the key read-only and Remove disabled.
- **Open before prod:** set `INTEGRATION_SECRETS_KEY` on prod (`openssl rand -base64 32`) and keep a copy somewhere safe. Losing it makes every stored header secret and signing secret unreadable.
