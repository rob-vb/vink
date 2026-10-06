import { describe, expect, test } from "vitest";
import type { Infer } from "convex/values";
import type { field } from "../schema";
import { dummyPayload, envelopeOf, payloadOf } from "./payload";

const fields: Infer<typeof field>[] = [
  { type: "text", label: "Kenteken", key: "license_plate", required: true },
  { type: "number", label: "Km", key: "mileage_km", required: false },
  { type: "date", label: "Datum", key: "order_date", required: false },
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
    key: "tyre_changes",
    required: false,
    fields: [
      { type: "text", label: "Positie", key: "position", required: true },
      { type: "number", label: "Profiel", key: "tread_depth_mm", required: false },
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
      fields: { license_plate: "NWA30E", order_date: "2026-03-01" },
      lists: { tyre_changes: [{ position: "2L1" }, { position: "2R1", tread_depth_mm: 3 }] },
    });

    expect(payload).toEqual({
      license_plate: "NWA30E",
      mileage_km: null,
      order_date: "2026-03-01",
      urgent: null,
      fuel: null,
      tyre_changes: [
        { position: "2L1", tread_depth_mm: null },
        { position: "2R1", tread_depth_mm: 3 },
      ],
      lines: [],
    });
  });
});

describe("dummy data for a test-send", () => {
  test("gives an example value of each Field's type", () => {
    expect(dummyPayload(fields, "examples")).toEqual({
      license_plate: "Example Kenteken",
      mileage_km: 123.45,
      order_date: "2026-01-31",
      urgent: true,
      fuel: "diesel",
      tyre_changes: [{ position: "Example Positie", tread_depth_mm: 123.45 }],
      lines: [{ description: "Example Omschrijving" }],
    });
  });

  test("can leave every optional value empty, to show null and []", () => {
    expect(dummyPayload(fields, "empty")).toEqual({
      license_plate: "Example Kenteken",
      mileage_km: null,
      order_date: null,
      urgent: null,
      fuel: null,
      tyre_changes: [],
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
      data: { license_plate: "NWA30E" },
    }),
  ).toEqual({
    event: "document.approved",
    delivery_id: "dlv_1",
    test: false,
    document: { id: "doc1", filename: "werkorder.pdf", uploaded_at: "2026-09-24T10:00:00.000Z" },
    form: { id: "form1", version: 3 },
    approval: { mode: "manual", by: "user1", at: "2026-09-24T11:00:00.000Z" },
    data: { license_plate: "NWA30E" },
  });
});
