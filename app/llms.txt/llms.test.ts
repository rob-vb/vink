import { expect, test } from "vitest";
import { localeUrl } from "@/lib/seo";
import { GET } from "./route";

const llms = async () => await GET().text();

test("names the four standard integrations, how each connects, with a link to each guide", async () => {
  const text = await llms();
  for (const [label, anchor] of [
    ["Google Sheets, built in", "google-sheets"],
    ["n8n, via webhook", "n8n"],
    ["Make, via webhook", "make"],
    ["Zapier, via webhook", "zapier"],
  ]) {
    expect(text).toContain(`[${label}](${localeUrl("en", "/developers")}#${anchor})`);
  }
});

test("links the API reference", async () => {
  expect(await llms()).toContain(`(${localeUrl("en", "/developers/api")})`);
});

test("doesn't name Power Automate, Excel or Microsoft Entra before they have worked in a real account", async () => {
  const text = await llms();
  for (const name of ["Power Automate", "custom connector", "Excel", "Entra", "Microsoft"]) {
    expect(text).not.toContain(name);
  }
});
