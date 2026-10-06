# 10: Make app

**What to build:** a Make user connects Vink with an API Key and uses the module "Watch approved Documents" (instant trigger through Subscriptions, Form as a dropdown, fields from the Form) and "Send in a Document". Submitted for Make's review. The site lists Make as native once it is approved.

**Blocked by:** 04, 06

**Status:** ready-for-agent

- [ ] Connection with an API Key, validated with a test call
- [ ] Instant trigger via Subscriptions (webhook attach/detach), sample from the sample endpoint; List Fields as arrays
- [ ] Action module: send in a Document; refusals show Vink's error message
- [ ] Open checks (real accounts): Make developer account; a real scenario moves a Document end to end; submission for review
