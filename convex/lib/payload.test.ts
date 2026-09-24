import { describe, expect, test } from "vitest";
import type { Infer } from "convex/values";
import type { field } from "../schema";
import { dummyPayload, envelopeOf, payloadOf } from "./payload";

const fields: Infer<typeof field>[] = [
  { type: "text", label: "Kenteken", key: "licensePlate", required: true },
  { type: "number", label: "Km", key: "mileageKm", required: false },
  { type: "date", label: "Datum", key: "orderDate", required: false },
  { type: "boolean", label: "Spoed", key: "urgent", required: false },
  {
    type: "choice",
    label: "Brandstof",
    key: "fuel",
    required: false,
    options: [{ value: "diesel" }, { value: "petrol" }],
  },
  {
    type: "list",
    label: "Banden",
    key: "tyreChanges",
    required: false,
    fields: [
      { type: "text", label: "Positie", key: "position", required: true },
      { type: "number", label: "Profiel", key: "treadDepthMm", required: false },
    ],
  },
  {
    type: "list",
    label: "Regels",
    key: "lines",
    required: false,
    fields: [{ type: "text", label: "Omschrijving", key: "description", required: false }],
  },
];

describe("the Payload", () => {
  test("has every key of the Form Version, null for no value and [] for a List without entries", () => {
    const payload = payloadOf(fields, {
      fields: { licensePlate: "NWA30E", orderDate: "2026-03-01" },
      lists: { tyreChanges: [{ position: "2L1" }, { position: "2R1", treadDepthMm: 3 }] },
    });

    expect(payload).toEqual({
      licensePlate: "NWA30E",
      mileageKm: null,
      orderDate: "2026-03-01",
      urgent: null,
      fuel: null,
      tyreChanges: [
        { position: "2L1", treadDepthMm: null },
        { position: "2R1", treadDepthMm: 3 },
      ],
      lines: [],
    });
  });
});

describe("dummy data for a test-send", () => {
  test("gives an example value of each Field's type", () => {
    expect(dummyPayload(fields, "examples")).toEqual({
      licensePlate: "Example Kenteken",
      mileageKm: 123.45,
      orderDate: "2026-01-31",
      urgent: true,
      fuel: "diesel",
      tyreChanges: [{ position: "Example Positie", treadDepthMm: 123.45 }],
      lines: [{ description: "Example Omschrijving" }],
    });
  });

  test("can leave every optional value empty, to show null and []", () => {
    expect(dummyPayload(fields, "empty")).toEqual({
      licensePlate: "Example Kenteken",
      mileageKm: null,
      orderDate: null,
      urgent: null,
      fuel: null,
      tyreChanges: [],
      lines: [],
    });
  });
});

test("the envelope wraps the Payload with the Delivery, Document, Form and Approval, dates as ISO strings", () => {
  expect(
    envelopeOf({
      deliveryId: "dlv_1",
      test: false,
      document: { id: "doc1", filename: "werkorder.pdf", uploadedAt: Date.parse("2026-09-24T10:00:00Z") },
      form: { id: "form1", version: 3 },
      approval: { mode: "manual", by: "user1", at: Date.parse("2026-09-24T11:00:00Z") },
      data: { licensePlate: "NWA30E" },
    }),
  ).toEqual({
    event: "document.approved",
    deliveryId: "dlv_1",
    test: false,
    document: { id: "doc1", filename: "werkorder.pdf", uploadedAt: "2026-09-24T10:00:00.000Z" },
    form: { id: "form1", version: 3 },
    approval: { mode: "manual", by: "user1", at: "2026-09-24T11:00:00.000Z" },
    data: { licensePlate: "NWA30E" },
  });
});
