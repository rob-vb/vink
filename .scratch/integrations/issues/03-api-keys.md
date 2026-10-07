# 03: API Keys and the first endpoint

**What to build:** an Admin makes an API Key (GLOSSARY: API Key) with a name, sees it once, and can revoke it without touching other keys. A program calls `GET /v1/forms` with the key and gets the Organisation's Forms with their current Fields (key, label, type, required, List sub-Fields), snake_case on the wire (ADR 0005). This is the tracer bullet for the public API: auth, tenancy, error shape, versioning and the reference docs all exist after this ticket.

**Blocked by:** None (can start immediately).

**Status:** done (on integrations, e2e against dev passed 2026-10-07)

- [x] Admin-only UI to make, name, list (name, created, last used) and revoke API Keys; a Member can't see or make them
- [x] A key is stored only as a hash; it is shown once, at creation
- [x] `Authorization: Bearer <key>`; a missing, unknown or revoked key gets 401 with a JSON error body
- [x] `GET /v1/forms` returns only the key's own Organisation's Forms (tenancy test)
- [x] An OpenAPI document for `/v1`, and an API reference on the Developers page generated from or matching it
- [ ] Convex tests: hash, revoke, Admin only, tenancy, error shape; an e2e call with curl against dev

## Comments

**2026-10-06 (implementer).** What was built:

- `apiKeys` table (indexes `by_keyHash`, `by_organisationId`) and `convex/apiKeys.ts`: `list`, `create`, `revoke` (all Admin-only `orgQuery`/`orgMutation`), plus internal `byHash` and `markUsed`. A key is `vink_live_` + 40 base62 characters (about 238 bits). Only its SHA-256 hex is stored, with its last 4 characters for the list (`vink_live_…abcd`). `create` returns the key once. `revoke` deletes the row, so the key stops at once and the other keys are not touched. Last used is written at most once an hour.
- Public API in the Convex HTTP router. Convex's `httpRouter` has no path parameters, so `convex/http.ts` calls `registerRoutes(http, routes)` (`convex/publicApi/router.ts`). That registers one `pathPrefix: "/v1/"` route per method (GET, POST, PUT, PATCH, DELETE), and they dispatch to the table in `convex/publicApi/routes.ts`. Paths use `{name}` parameters, e.g. `/v1/forms/{form_id}/documents`. Use `route(method, path, handler)` for a keyed route: the handler gets `{ caller: { organisationId, apiKeyId }, params }`. Use `publicRoute(...)` for a route without a key. An unknown path gets 404 `not_found`; a known path with the wrong method gets 405 `method_not_allowed`. If a handler throws, the answer is 500 `internal_error`.
- Auth: `authenticate(ctx, request)` in `convex/publicApi/auth.ts`. `route()` runs it before the handler. A missing header gets 401 `missing_api_key`. An unknown or revoked key gets 401 `invalid_api_key`, and the two look the same.
- Errors: `apiError(status, code, message)` and `apiJson(body, status?, headers?)` in `convex/publicApi/respond.ts`. The body shape is `{ "error": { "code", "message" } }`.
- `GET /v1/forms` (`convex/publicApi/forms.ts`, `formsRoutes`) returns `{ "data": [ { id, name, description|null, version, fields } ] }`. Each Field has `key`, `label`, `type` and `required`. A `choice` Field also has `options` (the values), and a `list` Field also has `fields` (its sub-Fields). Extraction descriptions are left out. `getVersion` in `convex/forms.ts` is now exported for this.
- OpenAPI 3.1: `convex/publicApi/openapi/index.ts` builds `openApiDocument` from `parts: OpenApiPart[]`, with one file per resource (`openapi/forms.ts`). It also builds `errorCodes`, which merges `commonErrors` with each part's `errors`. Shared pieces live in `openapi/common.ts`: `securitySchemes.apiKey` (http bearer), the `Error` schema, and the `Unauthorized` and `InternalError` responses. Types are in `openapi/types.ts`. Paths are relative to the server `https://vink.page/v1`. The document is served at `GET /v1/openapi.json` without a key, with `Access-Control-Allow-Origin: *`.
- Next: in `next.config.ts`, `/v1/:path*` → `${NEXT_PUBLIC_CONVEX_SITE_URL}/v1/:path*` is the first entry in `beforeFiles`, and `v1` is added to `NOT_MARKETING`. `experimental.proxyClientMaxBodySize: "25mb"` is set too.
- UI: an "API Keys" card on the Organisation settings page. That page is already Admin-only (`requireAdmin`), so a Member gets a 404. The card lets an Admin name a key in a dialog, then shows the key once with a copy button and a "you see this only now" alert. The list shows name, hint, created and last used. Revoke asks first in an AlertDialog. The copy is in `messages/{nl,en}/appSettings.json` under `apiKeys`. The Dutch error texts are in `lib/server-errors.ts`. Layout follows Mobbin references (Mistral, Customer.io, Supabase API keys screens): a card with a "New API Key" action and a table with a revoke action per row.
- API reference: `app/(marketing)/[locale]/developers/api/` (`page.tsx` + `reference.tsx`), NL + EN. The copy is in its own namespace, `messages/{nl,en}/developersApi.json`, which is registered in `i18n/request.ts` and `lib/seo.ts`. The page renders straight from `openApiDocument`: overview, auth, an error table from `errorCodes`, one section per tag with method, path, description, parameters, responses, a curl example and an example answer, and an Objects section with one property table per schema. The page is in the sitemap (`lib/marketing-pages.ts`). Operation prose comes from the document and is English; the NL page says so. Not touched: `developers/page.tsx`, `developers.json` and `llms.txt` (ticket 01 adds the link).

How it was proven:
- `convex/apiKeys.test.ts` has 11 tests: the key is shown once and stored as its SHA-256; keys are unique; a name is required; a Member can't list, make or revoke; another Organisation's Admin can't see or revoke a key; 401 with the JSON body for a missing key, an unknown key, a non-Bearer header and a revoked key, while the other key keeps working; tenancy and the exact Field shape of `GET /v1/forms`; last used is written at most once an hour; 404 and 405 in the error shape; the OpenAPI document is served without a key.
- `convex/publicApi/router.test.ts` tests `{param}` matching.
- `convex/publicApi/openapi.test.ts` checks that the route table equals the document's paths, and that the live `/v1/forms` answer uses only documented keys. Tickets 04, 05 and 06 must document every route they add, or this test fails.
- The reference components were rendered with `react-dom/server` as a smoke check. `next dev` and the browser check were not run (left for the orchestrator).

Body size and timeouts on the `/v1` path (for ticket 04's PDF upload):
- Next buffers every request body up to `experimental.proxyClientMaxBodySize` (default 10 MB, see `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md`). Past that it cuts the body silently, and it does this also without `proxy.ts`, for external rewrites. It is now 25 MB.
- nginx for vink.page: `client_max_body_size 32m`.
- Cloudflare (free plan): 100 MB.
- Convex HTTP actions: a 20 MB request body.
- Next external rewrites time out after 30 s (`experimental.proxyTimeout`, not set here). The whole upload, `checkPdf` and the R2 store must finish within that.

E2E curl against dev (not run here; for the orchestrator after the push to dev). Make a key in the dev app under Organisation settings → API Keys, then:

```sh
BASE=https://<dev host>/v1            # or $NEXT_PUBLIC_CONVEX_SITE_URL/v1 straight to Convex
KEY=vink_live_...                     # shown once in the dialog

curl -i "$BASE/forms"                                                   # 401 missing_api_key, JSON body
curl -i "$BASE/forms" -H "Authorization: Bearer vink_live_nope"         # 401 invalid_api_key
curl -i "$BASE/forms" -H "Authorization: Bearer $KEY"                   # 200 {"data":[...]} with this Organisation's Forms only
curl -i "$BASE/forms" -X DELETE -H "Authorization: Bearer $KEY"         # 405 method_not_allowed
curl -i "$BASE/nope"  -H "Authorization: Bearer $KEY"                   # 404 not_found
curl -s "$BASE/openapi.json" | head -c 300                              # 200, "openapi":"3.1.0", no key needed
# Revoke the key in the app, then:
curl -i "$BASE/forms" -H "Authorization: Bearer $KEY"                   # 401 invalid_api_key
# Tenancy: a key from a second Organisation lists only that Organisation's Forms.
```
Also check that "Last used" in the app shows today after the first keyed call.

Open checks:
- The e2e curl above, through the Next rewrite on dev and then on prod. Check that the Next proxy passes `Authorization` and that Convex sees the right host.
- A visual check of the settings card and `/developers/api` in a browser.
- No real-account checks are needed for this ticket.


**2026-10-07 (orchestrator), e2e against dev.** Pushed `integrations` to dev. Straight to the Convex site and through the Next `/v1` rewrite (`next dev`, port 3013): 401 `missing_api_key` and `invalid_api_key`; `GET /v1/forms` lists only the key's own Organisation's Forms (a second Organisation's key gets `[]`); 405, 404 and `openapi.json` as documented; after revoking the key in the app, 401. In headless Chrome: an Admin makes a key (button disabled on an empty name, a double click makes one key), sees it once, revokes it. Fixed on the way: the shown-once text showed its message id (`<sleutel>` read as a tag); `lib/messages.test.ts` now guards the tags.
