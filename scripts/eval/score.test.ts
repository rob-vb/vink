import { expect, test } from "vitest";
import type { Extracted } from "../../convex/lib/extract";
import { scoreFixture } from "./score";

const form = {
  name: "invoice",
  fields: [
    { name: "invoiceNumber", type: "string" as const },
    { name: "total", type: "number" as const },
  ],
};

type Value = Extracted["fieldValues"][number];

/** An extracted Field Value that Jev is sure of, unless signals say otherwise. */
function value(key: string, got: Value["value"], rest: Partial<Value> = {}): Value {
  return {
    key,
    required: false,
    value: got,
    readText: got === null ? null : String(got),
    sourcePath: got === null ? null : key,
    pages: [1],
    signals: { match: 0.99, fit: 0.99, support: null },
    typeMismatch: false,
    unsure: false,
    conflicting: false,
    ...rest,
  };
}

function extracted(fieldValues: Value[], lists: Extracted["lists"] = []): Extracted {
  return { jevVerified: true, doesNotFit: false, lists, fieldValues };
}

test("counts the values that match the ground truth", () => {
  const score = scoreFixture({
    form,
    expected: {
      form: "invoice",
      fieldValues: { invoiceNumber: "F-2024-001", total: 658.08 },
      verified: [],
      unverified: ["invoiceNumber", "total"],
      unknown: [],
    },
    extracted: extracted([value("invoiceNumber", "F-2024-001"), value("total", 685.08)]),
    threshold: 0.8,
  });

  expect(score.values).toEqual({ right: 1, total: 2 });
});

test("leaves out unknown paths, and scores the verified ones on their own too", () => {
  const score = scoreFixture({
    form: {
      name: "invoice",
      fields: [...form.fields, { name: "currency", type: "string" }],
    },
    expected: {
      form: "invoice",
      fieldValues: { invoiceNumber: "F-2024-001", total: 658.08, currency: "EUR" },
      verified: ["invoiceNumber"],
      unverified: ["total"],
      unknown: ["currency"],
    },
    extracted: extracted([
      value("invoiceNumber", "f-2024 001"),
      value("total", 685.08),
      value("currency", "USD"),
    ]),
    threshold: 0.8,
  });

  expect(score.values).toEqual({ right: 0, total: 2 });
  expect(score.verifiedValues).toEqual({ right: 0, total: 1 });
});

const tyreForm = {
  name: "tire-service",
  fields: [
    {
      name: "tireChanges",
      type: "list" as const,
      fields: [
        { name: "position", type: "string" as const },
        { name: "treadDepthMm", type: "number" as const },
      ],
    },
  ],
};

const twoChanges = {
  form: "tire-service",
  fieldValues: {
    tireChanges: [
      { position: "1", treadDepthMm: 2 },
      { position: "4", treadDepthMm: 3 },
    ],
  },
  verified: [],
  unverified: ["tireChanges[0].position", "tireChanges[0].treadDepthMm", "tireChanges[1].position", "tireChanges[1].treadDepthMm"],
  unknown: [],
};

function entry(list: string, index: number, values: Record<string, string | number | null>) {
  return Object.entries(values).map(([key, got]) => value(key, got, { list: { key: list, entry: index } }));
}

function list(key: string, entries: number) {
  return { key, required: false, sourcePath: "tyreChanges", entries, completeness: 0.97 };
}

test("a List is right when it has as many entries as expected, and its entries' values are scored in order", () => {
  const score = scoreFixture({
    form: tyreForm,
    expected: twoChanges,
    extracted: extracted(
      [...entry("tireChanges", 0, { position: "1", treadDepthMm: 2 }), ...entry("tireChanges", 1, { position: "4", treadDepthMm: 8 })],
      [list("tireChanges", 2)],
    ),
    threshold: 0.8,
  });

  expect(score.lists).toEqual({ right: 1, total: 1 });
  expect(score.values).toEqual({ right: 3, total: 4 });
});

test("a List with the wrong number of entries can't be aligned, so each of its expected values counts as wrong", () => {
  const score = scoreFixture({
    form: tyreForm,
    expected: twoChanges,
    extracted: extracted(entry("tireChanges", 0, { position: "1", treadDepthMm: 2 }), [list("tireChanges", 1)]),
    threshold: 0.8,
  });

  expect(score.lists).toEqual({ right: 0, total: 1 });
  expect(score.values).toEqual({ right: 0, total: 4 });
});

test("counts which wrong values Needs Review catches at the threshold, and which right ones it flags", () => {
  const unsure = { signals: { match: 0.95, fit: 0.6, support: null } };
  const score = scoreFixture({
    form: {
      name: "invoice",
      fields: [
        { name: "a", type: "string" },
        { name: "b", type: "string" },
        { name: "c", type: "string" },
        { name: "d", type: "string" },
        { name: "e", type: "string" },
      ],
    },
    expected: {
      form: "invoice",
      fieldValues: { a: "right", b: "right", c: "right", d: "right", e: "right" },
      verified: [],
      unverified: ["a", "b", "c", "d", "e"],
      unknown: [],
    },
    extracted: extracted([
      value("a", "wrong", unsure),
      value("b", "wrong", { typeMismatch: true }),
      value("c", "wrong"),
      value("d", "right", unsure),
      value("e", "right"),
    ]),
    threshold: 0.8,
  });

  expect(score.needsReview).toEqual({ flagged: 3, wrong: 3, wrongFlagged: 2 });
  expect(score.mistakes).toEqual([
    { path: "a", got: "wrong", want: "right", needsReview: true },
    { path: "b", got: "wrong", want: "right", needsReview: true },
    { path: "c", got: "wrong", want: "right", needsReview: false },
  ]);
});

test("a value of a List that Needs Review counts as flagged", () => {
  const score = scoreFixture({
    form: tyreForm,
    expected: twoChanges,
    extracted: extracted(entry("tireChanges", 0, { position: "1", treadDepthMm: 2 }), [
      { ...list("tireChanges", 1), completeness: 0.5 },
    ]),
    threshold: 0.8,
  });

  expect(score.needsReview).toEqual({ flagged: 4, wrong: 4, wrongFlagged: 4 });
});
