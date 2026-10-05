# GA4 and cookie consent in the EU

Type: research
Status: resolved
Blocked by: 

## Question

What does adding Google Analytics 4 to the marketing site require for EU/Dutch visitors — the AP/ePrivacy and GDPR rules, Consent Mode v2 (basic vs advanced), which consent banner fits a Next.js + shadcn site (build our own vs a CMP like Cookiebot or an open-source one), how consent is remembered across `/` and `/nl`, and whether the app under `/app` must stay free of GA? Output: a recommended setup and what the banner must offer.

## Answer

GA4 needs consent before it loads for EU and Dutch visitors. Dutch law (Telecommunicatiewet art. 11.7a) exempts only analytics with "no or little" privacy impact, and the AP has never confirmed GA4 meets that; its old GA guide covered Universal Analytics, and in Nov 2025 it said it is still working out which cookies qualify. Google's EU User Consent Policy also requires recording consent. EU-US transfers can rely on the Data Privacy Framework, though an appeal against it (C-703/25 P) is pending.

- **Consent Mode v2, basic:** no Google tag loads until Accept. Advanced mode's cookieless pings count as device access (EDPB) and need consent too. Ad consent types permanently denied; Google signals and ad personalisation off.
- **Banner: our own, built with shadcn.** One purpose (statistics); "Accept" and "Reject" equal on the first layer, which also names the processor, the purpose, the one third party (Google) and how to withdraw. No pre-ticked boxes, no cookie wall, a permanent "Cookie settings" link in the footer, English on `/` and Dutch on `/nl`, consent logged. c15t is a fallback, but its GA integration defaults to advanced mode.
- **Remembering the choice:** one first-party cookie, `Path=/`, kept 6 months, read client-side so pages stay static. Set GA's `cookie_domain` to the site host (default would be `.vink.page`).
- **`/app` stays GA-free:** gtag only in the `(marketing)` root layout; crossing root layouts forces a full load, so gtag never follows into the app. Measure sign-up clicks on the marketing CTAs.

Secondary sources: the DPF appeal status (IAPP, WilmerHale), the Digital Omnibus status, and the removal of the AP's old GA guide (a blog; the AP's Jan 2025 Woo decision confirms it covers an old GA version).

Findings: branch `research/ga4-and-cookie-consent`, file `.scratch/vink-marketing/research/ga4-and-cookie-consent.md`.
