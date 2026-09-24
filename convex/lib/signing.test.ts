import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { signatureOf } from "./signing";

test("the signature is HMAC-SHA256 of the raw body with the Integration's secret, hex-encoded", async () => {
  const body = JSON.stringify({ event: "document.approved", data: { licensePlate: "NWA30E" } });
  const expected = createHmac("sha256", "whsec_test").update(body).digest("hex");

  expect(await signatureOf("whsec_test", body)).toBe(`sha256=${expected}`);
});

test("a different body or secret gives a different signature", async () => {
  const a = await signatureOf("s1", "{}");
  expect(await signatureOf("s2", "{}")).not.toBe(a);
  expect(await signatureOf("s1", "{ }")).not.toBe(a);
});
