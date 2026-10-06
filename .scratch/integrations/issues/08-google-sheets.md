# 08: Google Sheets Integration

**What to build:** an Admin adds an Integration of kind Google Sheets: connects a Google account (scope `drive.file`), and Vink makes a new sheet in that Drive with a header row. Attached to a Form, every Approval adds rows to it (ADR 0009): one row per entry of the first List Field, the Document's other values repeated, any further List Field as JSON in one cell. Columns are the Field keys plus `document`, `approved_at`, `approved_by`, `delivery_id`; a Field added in a new Form Version gets a new column on the right. Deliveries, retries, re-send and test-send work as for a Webhook.

**Blocked by:** 02

**Status:** done (on integrations, open checks listed)

- [x] Connect flow (OAuth) from the Integration dialog; the token is stored encrypted, like a secret header
- [x] Vink makes the sheet and shows a link to it
- [x] Row building is one pure function with tests: entries, no entries, second List as JSON, new Field column, `null` as an empty cell
- [x] A test-send writes dummy rows marked as test
- [x] Google rate limits and 5xx are retried; a refused write fails the Delivery with a clear reason
- [x] Built and tested on a fake Google adapter
- [ ] Open checks (real accounts): Google Cloud OAuth consent screen with brand verification; a real Approval on prod adds the right rows

## Comments

**2026-10-06 (implementer):** Built on `int/08-google-sheets`.

- Kind: `integrations` has a second member, `kind: "google_sheets"`, with `refreshToken` (encrypted with `lib/secrets.ts`), `spreadsheetId`, `sheetId` (the tab's id, so a renamed tab still works) and `spreadsheetUrl`. `integrations.list` returns the sheet link as `url` and `headers: []`. New `integrations.rename` (any kind); `update` and `signingSecret` refuse a non-Webhook.
- Google client: `convex/lib/google.ts`, interface `GoogleClient`, object `google`, plain `fetch`, no SDK. OAuth web flow with scope `drive.file`, `access_type=offline`, `prompt=consent`. Sheets API v4: create (header row written and frozen), read row 1 plus the `delivery_id` column, one `batchUpdate` that widens the grid, writes new header cells and appends rows. Values are written as values (`userEnteredValue.stringValue`), never as formulas. `fakeGoogle` in `convex/test.setup.ts` keeps sheets in memory.
- Connect flow: the dialog calls `googleSheets.connectUrl` (Admin). Google returns to the Next route `app/api/integrations/google/callback`, which calls `googleSheets.connect` as the signed-in Admin. The `state` is `<slug>.<claims>.<HMAC>` (`convex/lib/oauthState.ts`, key derived from `INTEGRATION_SECRETS_KEY`, 15 min). The claims name the Organisation and the Admin, and `connect` checks both against the caller. The Integrations page then shows a toast (`?google=connected|no_access|denied|failed`). The sheet gets the name of the Integration and a tab called "Vink".
- Rows: `rowsOf(envelope, approverEmail)` and `sheetLayout(header, rows)` in `convex/lib/rows.ts` (pure, for 11 too). A first-List sub-Field column is `<list key>.<sub key>`. A further List is JSON in one cell, and an empty List is an empty cell. `null` is an empty cell. The `document` column is the filename; a test-send writes `[test] <filename>` and a `delivery_id` that starts with `test_`. **`approved_by` is the approver's email (`documents.approval.byEmail`); for Auto-Send it is `Auto-Send`.** Columns are matched by header name, so an Admin can move columns. A missing key is added on the right, and existing columns never move.
- No duplicate rows: before it appends, the adapter reads the `delivery_id` column. When the Delivery is already there, it adds nothing ("Already in the sheet"). This covers a retry after a lost answer and a re-send.
- Seam change: `IntegrationAdapter.send(integration, envelope, details)` takes `details: { approverEmail }`. The envelope has only the user id. `testSendInput` now returns the envelope as JSON, like a Delivery, so the data keys stay in Form order.
- Outcomes: no answer, 408, 429 and 5xx are retried, with Retry-After. 404 fails: "The sheet is gone: it, or its Vink tab, was deleted". Other 4xx fail: "Google refused the write (<status>)". `invalid_grant` or 401 fails at once with `cause: "access_expired"` on the `failed` Outcome. The reason is `ACCESS_EXPIRED`, and the usual failed-Delivery notice is sent. **For 09:** detect access expired as `outcome.kind === "failed" && outcome.cause === "access_expired"` in `deliveries.recordAttempt`. `GoogleFailure.accessRefused` is the client-side flag.
- UI: the Integration dialog has a kind choice (Webhook / Google Sheets, ToggleGroup) and a "Connect Google account" button with three short notes. In edit mode, a Sheets Integration shows only its name and the sheet link. The card shows a "Google Sheets" badge and "Open the sheet", and no signing secret. The test-send text says that test rows are added. Copy is in NL and EN. The Dutch server errors are in `lib/server-errors.ts`.
- Not changed: the marketing integrations list (`lib/platforms.ts`) and `llms.txt`. Decision 11 says the site shows only integrations that work, so add Google Sheets once the open checks below pass. We didn't add Google as a subprocessor: the sheet is in the customer's own Drive, like a Webhook endpoint.
- Proof: `convex/lib/rows.test.ts` (6: entries, no entries, second List as JSON, new Field column, null as empty cell, Auto-Send and test marker). `convex/googleSheets.test.ts` (15, on `fakeGoogle`: consent URL, connect makes the sheet with the header and stores the token encrypted, state of another Admin, Org, tampered or expired refused, Member refused, no drive.file scope, Approval rows, new Form Version column, 429/503 retried, 403 refused, 404, access expired fails at once with a notice, lost answer not written twice, re-send once, test-send rows, rename/no Webhook functions). `convex/lib/google.test.ts` (4, the real client against a stubbed `fetch`). Full suite: 427/427. `tsc` and `eslint` are clean.

Open checks (need real accounts or a person with access):
1. Make a Google Cloud OAuth client of type Web application. Add the redirect URI `https://vink.page/api/integrations/google/callback`, plus the dev origin if wanted. Set up the consent screen with brand verification. `drive.file` is a non-sensitive scope, so no security assessment is needed.
2. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` on the Convex deployments (dev and prod). `SITE_URL` must be the public origin, because it makes the redirect URI.
3. On prod, connect a real Google account, then check the sheet, its header row and its "Vink" tab. Do a test-send, then a real Approval of a Form with a List, and check the rows.
4. Revoke Vink's access in the Google account, then check that the Delivery fails with "Access expired". The Reconnect itself is ticket 09.
