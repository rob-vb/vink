# 07: Zapier app

**What to build:** a Zapier user connects Vink with an API Key and builds a Zap with the trigger "Document approved" (pick a Form; fields come from the Form's Fields) or the action "Send in a Document" (pick a Form, pass a PDF file). Uses the public API's Subscriptions as REST hooks. First private, then submitted for the public directory. The site lists Zapier as native once it is public.

**Blocked by:** 04, 06

**Status:** done (on integrations, open checks listed)

- [x] Auth with an API Key, tested with a test call
- [x] Trigger: REST hook via Subscriptions, Form as a dynamic dropdown, sample from the sample endpoint; List Fields arrive as line items
- [x] Action: send in a Document; a refusal shows Vink's error message
- [x] Zapier CLI tests green
- [ ] Open checks (real accounts): Zapier developer account; a private Zap moves a real Document end to end; submission for the public directory

## Comments

**2026-10-06, built.** `integrations/zapier/`: a Zapier Platform CLI app on `zapier-platform-core` 19.1.0 (CommonJS), own `package.json` + `package-lock.json`, `node_modules` ignored. Root `tsconfig.json`, `eslint.config.mjs` and `vitest.config.ts` exclude the folder.
- Auth `custom`: field `api_key`, test `GET /v1/forms`, connection label `vink_live_…abcd` (the hint Vink's API Keys list shows). `beforeRequest` adds `Authorization: Bearer` only to `https://vink.page/v1` URLs (the action downloads files from other hosts). `afterResponse` turns a 4xx/5xx `{error:{code,message}}` into `z.errors.Error(message, code, status)`, so Zapier shows Vink's sentence.
- Trigger `document_approved` (hook): `performSubscribe` `POST /v1/subscriptions {form_id, url: targetUrl}`, `performUnsubscribe` `DELETE /v1/subscriptions/{id}` (404 = already gone), `perform` returns the envelope with `id = delivery_id`, `performList` from `GET /v1/forms/{id}/sample`. Form dropdown from the hidden trigger `forms`. Output fields: the envelope's fixed keys + one per Field (`data__<key>`), List sub-Fields as line items (`data__<list>[]<sub>`).
- Action `send_document`: Form dropdown, `file` (type file: a Zapier file or URL) streamed via `z.request({raw:true})` into multipart part `file` (form-data), optional `filename` (also sent as `?filename=`); without it the host's Content-Disposition name, the URL's `.pdf` name, else `document.pdf`.
- `flags.cleanInputData: false` (Zapier check D028).

**Proof:** `cd integrations/zapier && npm test` → 4 suites, 13 tests green (jest + nock, net connect disabled; one test proves the API Key never reaches the file host). `npx zapier-platform-cli@19.1.0 validate` (no login) → structurally sound, 28 integration checks passed, 0 warnings.

**Open checks (real accounts):** Zapier developer account (`zapier login`, `zapier register "Vink"`, commit `.zapierapprc`, `zapier push`); a private Zap moves a real Document end to end both ways (needs `/v1` live on vink.page: today `GET https://vink.page/v1/forms` answers the site's 404 page); Subscription hook URL accepted by `checkEndpoint` (hooks.zapier.com is https); upload of a real hydrated Zapier file through the Next `/v1` proxy (chunked multipart, size cap); submission for the public directory (logo, category, live Zaps). Steps in `integrations/zapier/README.md`. `lib/platforms.ts` keeps Zapier "via webhook" until the app is public.

