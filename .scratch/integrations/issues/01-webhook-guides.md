# 01: Webhook guides for Make, n8n, Zapier and Power Automate

**What to build:** a customer without a developer can send approved Payloads to Make, n8n, Zapier or Power Automate today, using the existing Webhook. The Developers page (NL and EN) gets one guide per platform: make the receiving URL there, paste it into a new Webhook in Vink, do a test-send, map the fields. Each guide says honestly which plan the platform needs (Make, n8n: free; Zapier: "Webhooks by Zapier" needs a paid plan; Power Automate: "When an HTTP request is received" is Premium) and that the secret URL is the security there, since these platforms can't easily check `X-Vink-Signature`. Make and n8n come first. The site lists these four as "via webhook". Spec: `../spec.md`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Four guides on the Developers page, NL and EN, in the brand voice (`.agents/product-marketing.md`)
- [ ] Each guide names the plan the platform needs and how a List Field arrives (an array)
- [ ] The site's integrations list shows the four platforms labelled "via webhook", nothing that doesn't work yet
- [ ] `llms.txt` mentions the guides
- [ ] Open check (real accounts): follow each guide from scratch against prod with the test account; a test-send and a real Approval arrive
