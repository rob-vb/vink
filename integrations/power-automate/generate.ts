// Writes the Power Automate connector files the Developers page offers for
// download. Run after changing the /v1 OpenAPI document or connector.ts:
//   npx tsx integrations/power-automate/generate.ts
// connector.test.ts fails while the committed files differ from this output.
import { writeFileSync } from "node:fs";
import { buildConnector } from "./connector";

const out = new URL("../../public/power-automate/", import.meta.url);
const { apiDefinition, apiProperties } = buildConnector();
writeFileSync(new URL("apiDefinition.swagger.json", out), `${JSON.stringify(apiDefinition, null, 2)}\n`);
writeFileSync(new URL("apiProperties.json", out), `${JSON.stringify(apiProperties, null, 2)}\n`);
