import { expect, test } from "vitest";
import en from "@/messages/en/developers.json";
import nl from "@/messages/nl/developers.json";
import { platforms } from "./platforms";

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k));
}

test("the Developers page has the same copy keys in Dutch and English", () => {
  expect(keysOf(nl).sort()).toEqual(keysOf(en).sort());
});

test("every listed platform has a guide in both languages: plan, steps, List Fields and security", () => {
  for (const messages of [en, nl]) {
    const guides = (messages as { platforms?: { guides?: Record<string, Record<string, unknown>> } }).platforms
      ?.guides;
    for (const platform of platforms) {
      const guide = guides?.[platform.key];
      expect(guide, platform.name).toBeDefined();
      expect(Object.keys(guide!)).toEqual(expect.arrayContaining(["plan", "steps", "lists", "security"]));
    }
  }
});

test("the list labels every platform as working via the webhook, nothing else", () => {
  expect(platforms.map((p) => [p.name, p.via])).toEqual([
    ["Make", "webhook"],
    ["n8n", "webhook"],
    ["Zapier", "webhook"],
    ["Power Automate", "webhook"],
  ]);
});

test("Power Automate offers the custom connector's files for download, and they are on the site", async () => {
  const powerAutomate = platforms.find((p) => p.id === "power-automate");
  const files = powerAutomate && "connectorFiles" in powerAutomate ? powerAutomate.connectorFiles : [];
  expect(files).toEqual(["/power-automate/apiDefinition.swagger.json", "/power-automate/apiProperties.json"]);
  for (const file of files) expect((await import(`@/public${file}`)).default, file).toBeTypeOf("object");
  expect(platforms.filter((p) => "connectorFiles" in p).map((p) => p.name)).toEqual(["Power Automate"]);
});
