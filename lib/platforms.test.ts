import { existsSync } from "node:fs";
import { join } from "node:path";
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

test("the list names Google Sheets as built in, the others via the webhook, and only Make and Zapier as having an app soon", () => {
  expect(platforms.map((p) => [p.name, p.via, p.app ?? null])).toEqual([
    ["Google Sheets", "native", null],
    ["n8n", "webhook", null],
    ["Make", "webhook", "soon"],
    ["Zapier", "webhook", "soon"],
  ]);
});

test("every platform's logo is a file in public/", () => {
  for (const platform of platforms) {
    expect(existsSync(join(process.cwd(), "public", platform.logo)), platform.logo).toBe(true);
  }
});

test("the Developers page doesn't name Power Automate, Excel or Microsoft Entra before they have worked in a real account", () => {
  const text = JSON.stringify([en, nl]);
  for (const name of ["Power Automate", "Excel", "Entra", "Microsoft"]) {
    expect(text).not.toContain(name);
  }
});
