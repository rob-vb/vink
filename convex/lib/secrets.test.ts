import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { decryptSecret, encryptSecret } from "./secrets";

beforeEach(() => {
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
});
afterEach(() => vi.unstubAllEnvs());

test("a secret encrypts and decrypts back to itself", async () => {
  const sealed = await encryptSecret("Bearer sk_live_123");

  expect(sealed).not.toContain("sk_live_123");
  expect(await decryptSecret(sealed)).toBe("Bearer sk_live_123");
});

test("the same secret encrypts differently each time", async () => {
  expect(await encryptSecret("x")).not.toBe(await encryptSecret("x"));
});

test("a tampered secret doesn't decrypt", async () => {
  const sealed = await encryptSecret("Bearer sk_live_123");
  const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1);

  await expect(decryptSecret(tampered)).rejects.toThrow();
});

test("without a key on the deployment, nothing is encrypted", async () => {
  vi.stubEnv("INTEGRATION_SECRETS_KEY", "");

  await expect(encryptSecret("x")).rejects.toThrow("INTEGRATION_SECRETS_KEY");
});
