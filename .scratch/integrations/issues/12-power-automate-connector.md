# 12: Power Automate custom connector

**What to build:** a Power Automate user imports Vink's custom connector file, connects with an API Key, and builds a flow with the trigger "When a Document is approved" (webhook trigger via Subscriptions, pick a Form) and the action "Send in a Document". The Developers page explains the import and that it needs a Premium licence. Certification by Microsoft only when customers ask for it.

**Blocked by:** 04, 06

**Status:** done (on integrations, open checks listed)

- [x] Connector definition built from the OpenAPI document, with API Key auth, the webhook trigger and the action
- [x] Downloadable from the Developers page, with an import guide (NL and EN)
- [ ] Open checks (real accounts): import into a Premium environment; a flow receives an Approval and sends in a Document

## Comments

**2026-10-06, build.**
- `integrations/power-automate/connector.ts` builds the Swagger 2.0 `apiDefinition` + `apiProperties` from `openApiDocument`; `npx tsx integrations/power-automate/generate.ts` writes them to `public/power-automate/` (served at `https://vink.page/power-automate/apiDefinition.swagger.json` and `apiProperties.json`). Operations: `createSubscription` = trigger "When a Document is approved" (`x-ms-trigger: single`, body `url` has `x-ms-notification-url`, `form_id` a dropdown via `x-ms-dynamic-values` on `listForms`), `deleteSubscription` (internal), `sendDocument` = action "Send in a Document" (PDF as raw `application/octet-stream` body, `format: binary`; Power Automate handles that better than multipart `formData` files), `listForms` and `getFormSchema` (internal).
- Auth: `securityDefinitions` API Key in the `Authorization` header. Import through the Power Automate UI takes only the swagger file, so no `setheader` policy: the user types `Bearer <key>` in the API Key field (same for `pac connector create` with `apiProperties.json`).
- API changes: `POST /v1/subscriptions` 201 now has `Location: ${SITE_URL}/v1/subscriptions/{id}` (Power Automate unsubscribes by `DELETE` on it). New `GET /v1/forms/{form_id}/schema` → `{ schema }`, the envelope as a Swagger-style JSON Schema (`x-nullable`, Field labels as `title`/`x-ms-summary`): `x-ms-dynamic-schema` needs an operation that returns a schema, and `/sample` returns an example. Trigger outputs: `x-ms-notification-content` with `x-ms-dynamic-schema` + `x-ms-dynamic-properties` (`body/form_id`) on it. Both in the OpenAPI parts.
- Developers page: Power Automate section has "With the Vink connector" (downloads, import, connect with `Bearer <key>`, trigger, action, Premium, `pac` line) above "Via the webhook" (the old guide, unchanged). `lib/platforms.ts` gets `connectorFiles`; `via` stays `webhook` (not a public app). llms.txt names the connector.

**Proof.** `integrations/power-automate/connector.test.ts` (7): Swagger 2.0 shape, every operation maps to an `openApiDocument` route with the same method, operationId and parameters, only Swagger 2.0 constructs, trigger/unsubscribe/dynamic wiring, action body, and committed files == generator output. `convex/subscriptions.test.ts`: Location header unsubscribes; `/schema` shape per Field type, 404. `lib/platforms.test.ts`, `app/llms.txt/llms.test.ts`. One-off (not committed): the generated definition validates against the official Swagger 2.0 JSON Schema with the `ajv` 6 in node_modules (and a broken copy fails).

Open checks (real accounts):
- `paconn validate` / `pac connector create` (needs a Microsoft login).
- Import `apiDefinition.swagger.json` into a Premium environment; connect with `Bearer <key>`; the Form dropdown lists Forms; trigger outputs show the Form's Fields (dynamic schema from a body property); an Approval starts the flow; turning the flow off deletes the Subscription via `Location`; "Send in a Document" with an email attachment makes a Document.
- Whether Power Automate shows `x-ms-summary`/`title` as the dynamic-content names.
- Optional: a connector icon (upload in the wizard); certification only on demand.

