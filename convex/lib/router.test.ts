// The real Router against a fake Jev (the SDK is mocked): what it sends and what it does with a Reading too big.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Reading, RoutableForm } from "./pipeline";

const systemOne = vi.fn();
vi.mock("@typesafe-ai/sdk", () => ({
  TypeSafeClient: class {
    systemOne = systemOne;
  },
  choice: (question: string, criteria: Record<string, string>) => ({ question, criteria }),
}));

const { router } = await import("./router");

const forms: RoutableForm[] = [
  { id: "inv", name: "Invoice", description: "Supplier invoices", fields: ["Supplier", "Total"] },
  { id: "cmp", name: "Complaint", description: null, fields: ["Subject"] },
];

beforeEach(() => {
  systemOne.mockReset();
  systemOne.mockResolvedValue({
    model: "jev",
    usage: { input_tokens: 10, output_tokens: 1 },
    answers: { form: { choice: "f1", probabilities: { f1: 0.8, none: 0.2 } } },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const huge = (): Reading => ({
  supplier: { name: "Hoekstra Installatie" },
  lineItems: Array.from({ length: 5000 }, (_, i) => ({ description: `Montage, artikel ${170000 + i}` })),
});

test("a Reading that fits is sent whole, and the pick is mapped to its Form", async () => {
  const reading = { supplier: { name: "Hoekstra Installatie" } };

  expect(await router.route(reading, forms)).toEqual({ formId: "cmp", probability: 0.8 });
  expect(systemOne.mock.calls[0][0].state).toEqual({ document: reading });
});

test("a huge Reading is cut and asked, not failed", async () => {
  const reading = huge();

  expect(await router.route(reading, forms)).toEqual({ formId: "cmp", probability: 0.8 });
  const { state } = systemOne.mock.calls[0][0];
  expect(JSON.stringify(state).length).toBeLessThan(64_000);
});

test("a Reading and Forms that cannot be cut to fit give No Form, with no call to Jev", async () => {
  vi.stubEnv("MATCH_TOKEN_CAP", "500");

  expect(await router.route(huge(), forms)).toEqual({ formId: null, probability: 1 });
  expect(systemOne).not.toHaveBeenCalled();
});
