# 07: Zapier app

**What to build:** a Zapier user connects Vink with an API Key and builds a Zap with the trigger "Document approved" (pick a Form; fields come from the Form's Fields) or the action "Send in a Document" (pick a Form, pass a PDF file). Uses the public API's Subscriptions as REST hooks. First private, then submitted for the public directory. The site lists Zapier as native once it is public.

**Blocked by:** 04, 06

**Status:** ready-for-agent

- [ ] Auth with an API Key, tested with a test call
- [ ] Trigger: REST hook via Subscriptions, Form as a dynamic dropdown, sample from the sample endpoint; List Fields arrive as line items
- [ ] Action: send in a Document; a refusal shows Vink's error message
- [ ] Zapier CLI tests green
- [ ] Open checks (real accounts): Zapier developer account; a private Zap moves a real Document end to end; submission for the public directory
