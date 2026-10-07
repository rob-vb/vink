import { expect, test } from "vitest";
import { localeUrl } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { GET } from "./route";

const llms = async () => await GET().text();

test("names the four automation platforms as working via the webhook, with a link to each guide", async () => {
  const text = await llms();
  for (const [name, anchor] of [
    ["Make", "make"],
    ["n8n", "n8n"],
    ["Zapier", "zapier"],
    ["Power Automate", "power-automate"],
  ]) {
    expect(text).toContain(`[${name}, via webhook](${localeUrl("en", "/developers")}#${anchor})`);
  }
});

test("links the API reference", async () => {
  expect(await llms()).toContain(`(${localeUrl("en", "/developers/api")})`);
});

test("names the Power Automate custom connector and its download", async () => {
  const text = await llms();
  expect(text).toContain("Vink's custom connector");
  expect(text).toContain(absoluteUrl("/power-automate/apiDefinition.swagger.json"));
});
