// The automation platforms the site names (spec, decision 11): only ones that
// work today, each labelled with how it connects. Today that is through the
// Webhook, with a guide on the Developers page (anchor = `id`). A platform
// moves to "native" only once its own Vink app is public.

export const platforms = [
  { id: "make", key: "make", name: "Make", via: "webhook" },
  { id: "n8n", key: "n8n", name: "n8n", via: "webhook" },
  { id: "zapier", key: "zapier", name: "Zapier", via: "webhook" },
  {
    id: "power-automate",
    key: "powerAutomate",
    name: "Power Automate",
    via: "webhook",
    // Vink's custom connector (integrations/power-automate), imported by the
    // customer: an extra way in, not a public app, so `via` stays webhook.
    connectorFiles: ["/power-automate/apiDefinition.swagger.json", "/power-automate/apiProperties.json"],
  },
] as const;

export type Platform = (typeof platforms)[number];
