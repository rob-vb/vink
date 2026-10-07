// The standard integrations the site names (spec, decision 11): only ones that
// work today, each labelled with how it connects. Google Sheets is built into
// Vink; the others receive the Webhook, with a guide on the Developers page
// (anchor = `id`). `app: "soon"` marks a platform whose own Vink app is built
// but not public yet. A platform moves to "native" only once that app is public.
//
// Power Automate is left off until its custom connector has worked in a real
// Premium environment; its guide and connector copy are in git history
// (before commit "Name only the standard integrations that work today").

type PlatformEntry = {
  readonly id: string;
  readonly key: "googleSheets" | "n8n" | "make" | "zapier";
  readonly name: string;
  readonly via: "native" | "webhook";
  readonly app?: "soon";
  /** Brand mark in `public/logos`, from simple-icons. */
  readonly logo: string;
};

export const platforms: readonly PlatformEntry[] = [
  { id: "google-sheets", key: "googleSheets", name: "Google Sheets", via: "native", logo: "/logos/google-sheets.svg" },
  { id: "n8n", key: "n8n", name: "n8n", via: "webhook", logo: "/logos/n8n.svg" },
  { id: "make", key: "make", name: "Make", via: "webhook", app: "soon", logo: "/logos/make.svg" },
  { id: "zapier", key: "zapier", name: "Zapier", via: "webhook", app: "soon", logo: "/logos/zapier.svg" },
];

export type Platform = PlatformEntry;
