# 08: Google Sheets Integration

**What to build:** an Admin adds an Integration of kind Google Sheets: connects a Google account (scope `drive.file`), and Vink makes a new sheet in that Drive with a header row. Attached to a Form, every Approval adds rows to it (ADR 0009): one row per entry of the first List Field, the Document's other values repeated, any further List Field as JSON in one cell. Columns are the Field keys plus `document`, `approved_at`, `approved_by`, `delivery_id`; a Field added in a new Form Version gets a new column on the right. Deliveries, retries, re-send and test-send work as for a Webhook.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Connect flow (OAuth) from the Integration dialog; the token is stored encrypted, like a secret header
- [ ] Vink makes the sheet and shows a link to it
- [ ] Row building is one pure function with tests: entries, no entries, second List as JSON, new Field column, `null` as an empty cell
- [ ] A test-send writes dummy rows marked as test
- [ ] Google rate limits and 5xx are retried; a refused write fails the Delivery with a clear reason
- [ ] Built and tested on a fake Google adapter
- [ ] Open checks (real accounts): Google Cloud OAuth consent screen with brand verification; a real Approval on prod adds the right rows
