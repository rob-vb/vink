import { afterEach, expect, test, vi } from "vitest";
import { estimateTokens, MAX_ROUTABLE_FORMS, tokenCap } from "./matchPlan";
import type { Reading, RoutableForm } from "./pipeline";
import { ROUTER_QUESTION, routerRequest, shortReading } from "./routerPlan";

afterEach(() => {
  vi.unstubAllEnvs();
});

const forms = (count: number, fields = 8): RoutableForm[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `form${i}`,
    name: `Form number ${i}`,
    description: "A description of what this Form collects, ".repeat(10),
    fields: Array.from({ length: fields }, (_, j) => `Field ${j} of form ${i}`),
  }));

const small: Reading = { supplier: { name: "Hoekstra Installatie", _pages: [1] }, totals: { inclVat: "151,25" } };

/** An invoice with 3000 lines: far more than the cap's worth of tokens. */
const huge = (): Reading => ({
  supplier: { name: "Hoekstra Installatie", _pages: [1] },
  lineItems: Array.from({ length: 3000 }, (_, i) => ({
    description: `Montage en balanceren, artikel ${170000 + i}, met een lange omschrijving`,
    quantity: `${i % 4}`,
  })),
  totals: { inclVat: "151,25" },
});

const tokensOf = (request: NonNullable<ReturnType<typeof routerRequest>>) =>
  estimateTokens(
    JSON.stringify(request.state).length,
    Object.values(request.criteria).reduce((sum, text) => sum + text.length + 10, 0) + ROUTER_QUESTION.length,
  );

test("a small Reading and a few Forms are sent whole", () => {
  const request = routerRequest(small, forms(3))!;

  expect(request.state).toEqual({ document: small });
  expect(Object.keys(request.criteria)).toEqual(["none", "f0", "f1", "f2"]);
  expect(request.listed.map((f) => f.id)).toEqual(["form0", "form1", "form2"]);
});

test("a huge Reading is cut to fit the cap, and still shows every part of the document", () => {
  const request = routerRequest(huge(), forms(5))!;

  expect(request).not.toBeNull();
  expect(tokensOf(request)).toBeLessThanOrEqual(tokenCap());
  const state = request.state.document as Record<string, unknown>;
  expect(Object.keys(state)).toEqual(["supplier", "lineItems", "totals"]);
  expect(JSON.stringify(state).length).toBeLessThan(JSON.stringify(huge()).length / 10);
  // The Router still has every Form to pick from, in order.
  expect(Object.keys(request.criteria)).toEqual(["none", "f0", "f1", "f2", "f3", "f4"]);
});

test("many Forms with long descriptions are shortened to fit, none of them dropped", () => {
  const many = forms(MAX_ROUTABLE_FORMS);
  const whole = routerRequest(small, many.slice(0, 3))!;

  const request = routerRequest(small, many)!;

  expect(request).not.toBeNull();
  expect(tokensOf(request)).toBeLessThanOrEqual(tokenCap());
  expect(Object.keys(request.criteria)).toHaveLength(MAX_ROUTABLE_FORMS + 1);
  expect(request.criteria.f0.length).toBeLessThan(whole.criteria.f0.length);
  expect(request.criteria.f0).toContain("Form number 0");
});

test("only the first 254 Forms are offered, as `none` takes a criterion", () => {
  const request = routerRequest(small, forms(300))!;

  expect(request.listed).toHaveLength(MAX_ROUTABLE_FORMS);
});

test("when even the smallest cut does not fit, there is no request", () => {
  vi.stubEnv("MATCH_TOKEN_CAP", "3000");

  expect(routerRequest(small, forms(MAX_ROUTABLE_FORMS))).toBeNull();
});

test("a cut Reading keeps its top-level keys, drops the Reader's notes and names what it lost", () => {
  const reading: Reading = {
    a: { x: "1", y: "2", z: "3", _pages: [1], _unsure: ["x"] },
    b: ["4", "5", "6"],
    c: { deep: { deeper: "7" } },
  };

  expect(shortReading(reading, 6, 100)).toEqual({ a: { x: "1", y: "2" }, b: ["4", "5"], c: { deep: { deeper: "7" } } });
  expect(shortReading(reading, 2, 100)).toEqual({ a: { x: "1" }, b: ["4"], c: { deep: { deeper: "7" } } });
  expect(shortReading({ a: "1", e: "", f: { _pages: [1] } }, 5, 100)).toEqual({ a: "1", "…": "more, not shown: e, f" });
  expect(shortReading({ a: "a very long value" }, 5, 6)).toEqual({ a: "a very" });
});
