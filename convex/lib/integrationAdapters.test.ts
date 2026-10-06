import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { fakeHttp } from "../test.setup";
import { adapterFor, sendTo, type Envelope, type Integration } from "./integrationAdapters";
import { encryptSecret } from "./secrets";

vi.mock("./http", async (original) => ({
  ...(await original<typeof import("./http")>()),
  http: (await import("../test.setup")).fakeHttp,
}));

beforeEach(() => {
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  fakeHttp.reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const envelope = { event: "document.approved", delivery_id: "dlv_1", test: false } as unknown as Envelope;

async function webhook(): Promise<Integration> {
  return {
    _id: "integration1" as Id<"integrations">,
    _creationTime: 0,
    organisationId: "organisation1" as Id<"organisations">,
    name: "Fleet system",
    kind: "webhook",
    url: "https://fleet.example.com/in",
    headers: [],
    signingSecret: await encryptSecret("whsec_test"),
  };
}

test("a Webhook is sent through the Webhook adapter", async () => {
  fakeHttp.answer({ status: 503, retryAfter: "120" });

  expect(await sendTo(await webhook(), envelope)).toEqual({
    outcome: { kind: "retry", reason: "The receiver answered 503", retryAfter: "120" },
    status: 503,
    body: "",
    error: null,
  });
  expect(fakeHttp.requests.map((r) => r.url)).toEqual(["https://fleet.example.com/in"]);
});

test("an Integration of an unknown kind can't be sent", async () => {
  const unknown = { ...(await webhook()), kind: "carrier_pigeon" } as unknown as Integration;

  await expect(sendTo(unknown, envelope)).rejects.toThrow(
    `Vink can't send to an Integration of kind "carrier_pigeon"`,
  );
  expect(() => adapterFor("toString")).toThrow("kind");
  expect(fakeHttp.requests).toEqual([]);
});
