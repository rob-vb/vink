# 10: Make app

**What to build:** a Make user connects Vink with an API Key and uses the module "Watch approved Documents" (instant trigger through Subscriptions, Form as a dropdown, fields from the Form) and "Send in a Document". Submitted for Make's review. The site lists Make as native once it is approved.

**Blocked by:** 04, 06

**Status:** done (on integrations, open checks listed)

- [x] Connection with an API Key, validated with a test call
- [x] Instant trigger via Subscriptions (webhook attach/detach), sample from the sample endpoint; List Fields as arrays
- [x] Action module: send in a Document; refusals show Vink's error message
- [ ] Open checks (real accounts): Make developer account; a real scenario moves a Document end to end; submission for review

## Comments

**2026-10-06 — built.** `integrations/make/`: the app as Make Apps Editor local files (`src/makecomapp.json` + codes;
deploy with right-click → Deploy to Make). Base (`https://vink.page/v1`, Bearer from `connection.apiKey`, errors show
`body.error.message`; 401 → InvalidAccessTokenError, 413/415/422 → DataError). Connection `vink` checks the key with
`GET /v1/forms`. Dedicated attached webhook `approvedDocuments`: Form dropdown (RPC `listForms`) as webhook parameter,
attach `POST /v1/subscriptions` keeps `subscriptionId` + `formId`, detach `DELETE /v1/subscriptions/{id}`. Instant trigger
"Watch approved Documents": static envelope interface + RPC `formFields`, which calls the custom IML function
`formFieldsSpec` (Fields → Make outputs; List Field → array of collections); sample = RPC `formSample` (sample endpoint).
Action "Send in a Document": Form dropdown, filename + buffer as multipart `file`.
Proof: `npx vitest run integrations/make` (8 tests): every file in makecomapp.json exists and parses; every request is a
path + method of `openApiDocument` and together they cover the 5 operations; every `rpc://`/connection/webhook/group
reference resolves; `formFieldsSpec` passes its own Make IML tests and maps the API reference's example Form.
Gaps: detach on an already-gone Subscription (404) shows an error in Make (Make can't treat a 4xx as success); no
universal module ("Make an API call") yet. `lib/platforms.ts` unchanged (Make stays "via webhook").
Open checks (real accounts), steps in `integrations/make/README.md`: Make developer account + API token; Make support
enables custom IML functions for the app; deploy; a real scenario moves a Document end to end (trigger fields before the
first run, `webhook.formId` available in the interface/sample RPCs, multipart upload, refusal messages, detach after an
Admin deleted the Webhook); submission for review.

**2026-10-06 (review fixes, `int/13-review-fixes`):** The detach gap is fixed in the API, not the app: `DELETE /v1/subscriptions/{id}` answers 200 `{id, deleted: true}` also when the Subscription is gone already, so Make removes its webhook without an error. README step 7 and "Known gap" are updated. What stays: after the API Key is revoked, detach gets 401 and Make shows Vink's message (the Subscription ended with the key). Real-account check: README step 7.

**2026-10-07 — deployed headless to Make (EU1, app `vink-fsvhks` v1).** New `integrations/make/deploy.mts`
(`npx tsx`, no new deps) deploys `src/` through Make's SDK Apps REST API (`/api/v2/sdk/apps`), the same calls the
Make Apps Editor extension makes; no VS Code CLI exists for this. It creates missing components, records Make's names
in `origins[0].idMapping` (same structure as the extension), patches differing metadata, and uploads codes whose
content differs (MD5 from `/checksum`, then a text/JSON compare). `--dry-run` only reads.
In Make now: connection `vink-fsvhks` (local `vink`), webhook `vink-fsvhks` (local `approvedDocuments`), modules
`watchApprovedDocuments` (instant trigger, webhook `vink-fsvhks`) and `sendDocument` (action, crud create), RPCs
`listForms`, `formFields`, `formSample`, and app base, readme and groups. 25 codes uploaded.
Proof: dry run → deploy (7 created, 25 uploaded) → second run: 0 created, 0 patched, 0 uploaded, 25 unchanged. A GET of
every component and section matches the local files (32/33 OK). `npx vitest run integrations/make`: 8 passed.
Open: the custom IML function `formFieldsSpec` is refused: `POST /sdk/apps/vink-fsvhks/1/functions → HTTP 403
{"detail":"Insufficient rights, admin permission \"apps edit\" is needed.","code":"IM002"}`. Ask Make support to
enable custom IML functions for `vink-fsvhks`, then run the script again; until then the RPC `formFields` has no
function, so the trigger shows no Field outputs before the first run. App icon: upload in Make's UI. The scenario
test (README "Test a scenario") is not run yet.
