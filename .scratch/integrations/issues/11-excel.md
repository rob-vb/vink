# 11: Excel Integration

**What to build:** an Admin adds an Integration of kind Excel: connects a Microsoft 365 account, and Vink makes a new workbook with a table in that OneDrive (or a SharePoint site the account can reach). Approvals add rows exactly as for Google Sheets (same row building, ADR 0009), and access lost / Reconnect works the same way. The docs say that many companies need their IT admin to consent to the Vink app first, and how they do that.

**Blocked by:** 08, 09

**Status:** ready-for-agent

- [ ] Connect flow (Microsoft identity platform, multi-tenant app); token stored encrypted
- [ ] Vink makes the workbook and table, and shows a link
- [ ] Reuses the row building of 08 and the Reconnect of 09
- [ ] A tenant that blocks user consent gets a clear message with the admin-consent link
- [ ] Built and tested on a fake Microsoft adapter
- [ ] Open checks (real accounts): Microsoft Entra app registration with publisher verification; a business tenant, including the admin-consent path; a real Approval on prod adds the right rows
