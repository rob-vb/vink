import { custom, formatEuro, formatNumber, FREE_PAGES, plans } from "@/lib/plans";
import { platforms, type Platform } from "@/lib/platforms";
import { localeUrl } from "@/lib/seo";

// A small English fact sheet for AI assistants (ticket 14). Built once at
// build time from the same plan data as the Pricing page.
export const dynamic = "force-static";

// What each platform needs on its own side.
const platformPlan: Record<Platform["key"], string> = {
  googleSheets: "built into Vink, needs a free Google account; Vink adds each approved Document as rows to a sheet it makes in your Google Drive",
  n8n: "free when self-hosted, n8n Cloud is paid (Webhook node)",
  make: "works on Make's free plan (Webhooks app, Custom webhook trigger); a Vink app for Make is coming soon",
  zapier: "needs a paid Zapier plan (Webhooks by Zapier, Catch Hook trigger); a Vink app for Zapier is coming soon",
};

export function GET() {
  const price = (amount: number) => formatEuro(amount, "en");
  const lines = [
    "# Vink",
    "",
    "> Vink turns any PDF, typed, scanned or handwritten, into clean data for your systems. People only check the values Vink isn't sure about, and nothing is sent without approval. Automated data entry (document data extraction) for operations and admin teams, Netherlands first.",
    "",
    "## Facts",
    "",
    "- Input: PDF, up to 10 MB and 20 pages each. Upload several at once, or email PDF attachments to a Form's own Intake Address.",
    "- Output: signed JSON webhook (HMAC-SHA256, `X-Vink-Signature: t=<unix>,v1=<hex>`), keyed by the team's own Fields, with retries and test-send.",
    "- Review: every value shows what was read and on which page; values below the Review Threshold are flagged Needs Review. Auto-Send is off by default.",
    "- Data: stored in the EU; deleted 30 days after sending by default (configurable 1 to 365 days). Subprocessors include two in the United States (TypeSafe, Resend); payments go through Stripe, also in the United States.",
    "- No templates: describe your Fields, or let Vink propose them from one example.",
    "",
    "## Integrations",
    "",
    "Approved Documents go out as a signed JSON POST (the Webhook) to any HTTPS endpoint attached to their Form, so Vink connects to any system that can receive HTTPS. These standard integrations work today, each with a step-by-step guide on the Developers page:",
    "",
    ...platforms.map(
      (p) =>
        `- [${p.name}, ${p.via === "native" ? "built in" : "via webhook"}](${localeUrl("en", "/developers")}#${p.id}): ${platformPlan[p.key]}.`,
    ),
    "",
    "## Pricing (EUR, excl. VAT)",
    "",
    `- Free start: ${FREE_PAGES} pages once, no credit card.`,
    ...plans.map(
      (plan) =>
        `- ${plan.name}: ${formatNumber(plan.pages, "en")} pages/month, ${price(plan.monthly)}/month, or ${price(plan.annualMonthly)}/month billed annually.`,
    ),
    `- ${custom.name}: more than ${formatNumber(custom.fromPages, "en")} pages/month, payment by invoice, from ${price(custom.fromMonthly)}/month billed annually.`,
    "- Every plan includes everything: unlimited users, all Forms and Fields, review and Approval, webhook Integrations.",
    "- Integration service: Vink builds the connection to your system, from €950 per connection, excl. VAT.",
    "",
    "## Links",
    "",
    `- [Home](${localeUrl("en", "/")})`,
    `- [Features](${localeUrl("en", "/features")})`,
    `- [Pricing](${localeUrl("en", "/pricing")})`,
    `- [Developers: Payload, signature, retries](${localeUrl("en", "/developers")})`,
    `- [Guides: Google Sheets, n8n, Make and Zapier](${localeUrl("en", "/developers")}#platforms)`,
    `- [API reference](${localeUrl("en", "/developers/api")})`,
    `- [Terms, data and subprocessors](${localeUrl("en", "/terms")})`,
    `- [Privacy policy](${localeUrl("en", "/privacy")})`,
    `- [Contact](${localeUrl("en", "/contact")})`,
    `- [Dutch site](${localeUrl("nl", "/")})`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
