# 09: Access lost, then Reconnect

**What to build:** when a spreadsheet Integration loses access (the person who connected it revoked it, left the company, or the token expired for good), its Deliveries fail with the reason "access expired" instead of retrying forever. The Integration shows that it needs reconnecting, and the Admins get the usual failed-Delivery notice. An Admin clicks "Reconnect", signs in again, and re-sends the failed Deliveries.

**Blocked by:** 08

**Status:** done (on integrations, open checks listed)

- [x] An auth refusal from the provider fails the Delivery at once with "access expired"; other errors keep the normal retry rules
- [x] The Integration list and dialog show "needs reconnecting"
- [x] Reconnect keeps the same sheet; a Reconnect with a Google account that can't reach the sheet is refused with a clear message
- [x] Re-sending a failed Delivery after Reconnect works and doesn't duplicate rows already written
- [x] Tests on the fake adapter for each case
- [ ] Open check (real account): revoke access in the Google account, see the failure, reconnect, re-send on prod

## Comments

**2026-10-06 (implementer):** Built on `int/09-reconnect`.

- State: the `google_sheets` member of `integrations` has `needsReconnect` (optional boolean). `deliveries.recordAttempt` sets it when a Delivery fails with `cause: "access_expired"` (only on a kind that is not a Webhook). A Reconnect clears it. `integrations.list` returns `needsReconnect` for every kind (always false for a Webhook). The failed-Delivery notice and the "access expired" reason are unchanged from 08. Other errors keep the normal retry rules.
- Reconnect: `integrations.reconnectUrl({ integrationId })` (Admin) signs the OAuth state with the Integration's id (new optional claim `integrationId` in `lib/oauthState.ts`) and returns the provider's consent page. Google sends the Admin back to the same callback route. `googleSheets.connect` sees the claim and calls `integrations.reconnect`. That function trades the code, then does a cheap read of the same spreadsheet (`GET spreadsheets/<id>?fields=spreadsheetId`; a 403 or 404 means no access). Then it stores the new token encrypted and clears the flag. The sheet is never made again. Results: `reconnected`, `no_access` (the Drive box was not ticked) and `no_sheet_access` (that account can't open the sheet; with `drive.file` that is any account other than the one that made it). The Integrations page shows these as toasts (`?google=…`), in NL and EN. The token of a refused account is not revoked, because it can be the account of another Integration.
- Provider seam: `convex/lib/accounts.ts` has `AccountProvider` (`consentUrl`, `exchangeCode`, `canReach`, `revoke`) and `googleAccount`. The reconnect functions in `integrations.ts` only use this seam. `googleSheets.connect` and `connectUrl` now use `googleAccount` too. The redirect URI moved there. `GoogleClient` has two new calls: `canOpen` and `revoke`.
- Revoke on remove: `removeIntegration` schedules `integrations.revokeAccess` (POST `https://oauth2.googleapis.com/revoke`) after the Integration is deleted. It is best-effort: an error is logged, and the delete never waits for it. It is skipped when the Organisation still has another Integration of the same kind. Google's revoke ends the account's whole grant to Vink, and Vink can't tell accounts apart (`drive.file` names no account), so the other Integration could lose access.
- UI: the card shows a red "Needs reconnecting" badge, plus an alert with the text and a "Reconnect" button. The edit dialog of a Sheets Integration always has "Reconnect Google account", with a hint (or the warning when it is flagged). The button is in `reconnect-button.tsx`. A Delivery is still re-sent per Delivery, with the existing button. The success toast says to do that.
- Proof: `convex/googleSheets.test.ts` has 7 new tests on `fakeGoogle`: the flag is set only by access expired; Reconnect then re-send writes to the same sheet and skips rows already there (lost answer, then access revoked); another account is refused and changes nothing; no Drive box, and another Organisation's Integration, are refused; a Webhook has no account to reconnect; remove revokes, also when Google doesn't answer; removing one of two Sheets Integrations doesn't revoke. `convex/lib/google.test.ts` has 2 new tests (the real `revoke` and `canOpen` against a stubbed `fetch`). The refusal test fails when the reach check is switched off. Full suite: 460/460. `tsc` and `eslint` are clean.

Open checks (need a real Google account):
1. On prod, connect a sheet. Then revoke Vink's access at myaccount.google.com → Security → Third-party apps. Approve a Document and see the Delivery fail with "Access expired" and the card show "Needs reconnecting". Click Reconnect, sign in with the same account, and re-send. Check that the rows appear once.
2. Reconnect with a different Google account and check the refusal toast. This confirms that Google answers 403 or 404 for a `drive.file` sheet that another account made.
3. Remove a Sheets Integration and check that Vink is gone from the account's third-party apps.
