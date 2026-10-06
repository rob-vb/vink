# 01: Webhook guides for Make, n8n, Zapier and Power Automate

**What to build:** a customer without a developer can send approved Payloads to Make, n8n, Zapier or Power Automate today, using the existing Webhook. The Developers page (NL and EN) gets one guide per platform: make the receiving URL there, paste it into a new Webhook in Vink, do a test-send, map the fields. Each guide says honestly which plan the platform needs (Make, n8n: free; Zapier: "Webhooks by Zapier" needs a paid plan; Power Automate: "When an HTTP request is received" is Premium) and that the secret URL is the security there, since these platforms can't easily check `X-Vink-Signature`. Make and n8n come first. The site lists these four as "via webhook". Spec: `../spec.md`.

**Blocked by:** None (can start immediately).

**Status:** done (on integrations, open checks listed)

- [x] Four guides on the Developers page, NL and EN, in the brand voice (`.agents/product-marketing.md`)
- [x] Each guide names the plan the platform needs and how a List Field arrives (an array)
- [x] The site's integrations list shows the four platforms labelled "via webhook", nothing that doesn't work yet
- [x] `llms.txt` mentions the guides
- [ ] Open check (real accounts): follow each guide from scratch against prod with the test account; a test-send and a real Approval arrive

## Comments

**2026-10-06:** Built on `int/01-webhook-guides`.
- Developers page (NL + EN): new section `#platforms` right after Overview, with the integrations list (four cards: name, "via webhook" badge, plan in short) and one guide each at `#make`, `#n8n`, `#zapier`, `#power-automate`, in that order. Each guide: plan, numbered steps (receiving URL → New Integration + Attach to a Form → Send test with Example values → map), how a List Field arrives (Make Iterator, n8n Split Out, Zapier line items / Looping, Power Automate Apply to each), the lock (secret URL; Make `x-make-apikey` and n8n Header Auth as an extra header via the Integration's secret headers) and one note on how the platform's answer meets Vink's retry rules (Make 400 when its queue is full, Zapier 404 when the Zap is off, Power Automate 202).
- Overview links the API reference at `/developers/api` (built by ticket 03).
- The integrations list lives in `lib/platforms.ts` (`via: "webhook"`); the page and `llms.txt` read it. A platform moves to native there once its own app is public (tickets 07, 10).
- `llms.txt`: an Integrations section with the four guides and their plan, plus links to the guides and the API reference.
- Platform facts checked on 2026-10-06 against the platforms' own docs: Zapier help (Webhooks by Zapier on Professional and up; Catch Hook; 404 when the Zap is off), n8n docs (Test vs Production URL, publish, Header Auth) and pricing (Cloud has no free plan, Community Edition free), Make help (Custom webhook, Detect new values, `x-make-apikey`, 200 Accepted / 400 queue full) and pricing (free plan 1,000 credits, 2 active scenarios), Microsoft Learn (Request trigger is Premium, Who can trigger the flow? defaults to tenant users, 202 without a Response action).
- Proof: `app/llms.txt/llms.test.ts` (four "X, via webhook" links + API reference), `lib/platforms.test.ts` (NL/EN key parity of developers.json, a full guide per listed platform, all labelled webhook). Every new message formatted once through use-intl (no ICU errors). `vitest.config.ts` got the `@/` alias so tests can load app code. tsc and eslint clean.
- Not checked: the page in a browser (orchestrator's UI check).

Open checks (need real accounts):
- Follow each guide from scratch against prod with the test account (Make free, n8n self-hosted or Cloud trial, Zapier paid, Power Automate Premium): a test-send arrives and the fields map; a real Approval arrives; a List Field splits per entry.
- Confirm the exact button labels in each platform's current UI (Make "Detect new values", n8n "Publish", Power Automate "Who can trigger the flow?", which Microsoft is still rolling out per region). Dutch Power Automate tenants show Dutch labels; the guides use the English ones.
