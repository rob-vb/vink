import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { signatureOf } from "./signing";

test("the signature is t=<unix seconds>,v1=<HMAC-SHA256 of \"{t}.{rawBody}\" with the Integration's secret, hex>", async () => {
  const body = JSON.stringify({ event: "document.approved", data: { invoiceNumber: "F-2026-118" } });
  const expected = createHmac("sha256", "whsec_test").update(`1790000000.${body}`).digest("hex");

  expect(await signatureOf("whsec_test", body, 1790000000)).toBe(`t=1790000000,v1=${expected}`);
});

test("a different body, secret or time gives a different signature", async () => {
  const a = await signatureOf("s1", "{}", 1);
  expect(await signatureOf("s2", "{}", 1)).not.toBe(a);
  expect(await signatureOf("s1", "{ }", 1)).not.toBe(a);
  expect((await signatureOf("s1", "{}", 2)).split(",v1=")[1]).not.toBe(a.split(",v1=")[1]);
});
