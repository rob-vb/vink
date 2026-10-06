# 09: Access lost, then Reconnect

**What to build:** when a spreadsheet Integration loses access (the person who connected it revoked it, left the company, or the token expired for good), its Deliveries fail with the reason "access expired" instead of retrying forever. The Integration shows that it needs reconnecting, and the Admins get the usual failed-Delivery notice. An Admin clicks "Reconnect", signs in again, and re-sends the failed Deliveries.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] An auth refusal from the provider fails the Delivery at once with "access expired"; other errors keep the normal retry rules
- [ ] The Integration list and dialog show "needs reconnecting"
- [ ] Reconnect keeps the same sheet; a Reconnect with a Google account that can't reach the sheet is refused with a clear message
- [ ] Re-sending a failed Delivery after Reconnect works and doesn't duplicate rows already written
- [ ] Tests on the fake adapter for each case
- [ ] Open check (real account): revoke access in the Google account, see the failure, reconnect, re-send on prod
