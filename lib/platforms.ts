// The automation platforms the site names (spec, decision 11): only ones that
// work today, each labelled with how it connects. Today that is through the
// Webhook, with a guide on the Developers page (anchor = `id`). A platform
// moves to "native" only once its own Vink app is public.

type PlatformEntry = {
  readonly id: string;
  readonly key: "make" | "n8n" | "zapier" | "powerAutomate";
  readonly name: string;
  readonly via: "webhook";
  readonly connectorFiles?: readonly string[];
};

export const platforms: readonly PlatformEntry[] = [
  { id: "make", key: "make", name: "Make", via: "webhook" },
  { id: "n8n", key: "n8n", name: "n8n", via: "webhook" },
  { id: "zapier", key: "zapier", name: "Zapier", via: "webhook" },
  {
    id: "power-automate",
    key: "powerAutomate",
    name: "Power Automate",
    via: "webhook",
    // Vink's custom connector (integrations/power-automate) is built but not yet
    // tried in a real Premium environment, so the page doesn't offer it. Once it
    // works, add back: connectorFiles: ["/power-automate/apiDefinition.swagger.json",
    // "/power-automate/apiProperties.json"]; the page and its copy are ready.
  },
];

export type Platform = PlatformEntry;
