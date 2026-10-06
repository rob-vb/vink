import { expect, test } from "vitest";
import { envelopeOf, type Payload } from "./payload";
import { rowsOf, sheetLayout } from "./rows";

function approved(data: Payload, options: { mode?: "manual" | "auto"; test?: boolean } = {}) {
  return envelopeOf({
    deliveryId: "dlv_1",
    test: options.test ?? false,
    document: { id: "doc1", filename: "werkbon-118.pdf", uploadedAt: Date.UTC(2026, 9, 5, 8) },
    form: { id: "form1", version: 2 },
    approval: { mode: options.mode ?? "manual", by: "user1", at: Date.UTC(2026, 9, 6, 9, 30) },
    data,
  });
}

test("a row per entry of the first List Field, with the Document's other values on each", () => {
  const rows = rowsOf(
    approved({
      license_plate: "AB-123-C",
      mileage_km: 81200,
      lines: [
        { description: "Tyre 205/55", quantity: 4 },
        { description: "Balancing", quantity: 1 },
      ],
    }),
    "ann@acme.example",
  );
  expect(rows).toEqual([
    {
      document: "werkbon-118.pdf",
      approved_at: "2026-10-06T09:30:00.000Z",
      approved_by: "ann@acme.example",
      delivery_id: "dlv_1",
      license_plate: "AB-123-C",
      mileage_km: 81200,
      "lines.description": "Tyre 205/55",
      "lines.quantity": 4,
    },
    {
      document: "werkbon-118.pdf",
      approved_at: "2026-10-06T09:30:00.000Z",
      approved_by: "ann@acme.example",
      delivery_id: "dlv_1",
      license_plate: "AB-123-C",
      mileage_km: 81200,
      "lines.description": "Balancing",
      "lines.quantity": 1,
    },
  ]);
});

test("a Document without entries is one row, its List columns left empty", () => {
  const rows = rowsOf(approved({ license_plate: "AB-123-C", lines: [] }), "ann@acme.example");
  expect(rows).toEqual([
    {
      document: "werkbon-118.pdf",
      approved_at: "2026-10-06T09:30:00.000Z",
      approved_by: "ann@acme.example",
      delivery_id: "dlv_1",
      license_plate: "AB-123-C",
    },
  ]);
});

test("a further List Field is written as JSON in one cell; an empty one is an empty cell", () => {
  const rows = rowsOf(
    approved({
      lines: [{ description: "Tyre 205/55" }],
      photos: [{ caption: "Front left", page: 2 }, { caption: null, page: 3 }],
      notes: [],
    }),
    "ann@acme.example",
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]["lines.description"]).toBe("Tyre 205/55");
  expect(rows[0].photos).toBe('[{"caption":"Front left","page":2},{"caption":null,"page":3}]');
  expect(rows[0].notes).toBeNull();
});

test("Auto-Send approves as Auto-Send; a test-send's rows are marked as test", () => {
  expect(rowsOf(approved({}, { mode: "auto" }), null)[0].approved_by).toBe("Auto-Send");
  const [row] = rowsOf(approved({}, { test: true }), null);
  expect(row.document).toBe("[test] werkbon-118.pdf");
  expect(row.approved_by).toBeNull();
});

test("values go under their column; a new Field gets a column on the right, null an empty cell", () => {
  const rows = rowsOf(
    approved({ license_plate: "AB-123-C", mileage_km: null, vin: "WVWZZZ1KZ", lines: [] }),
    "ann@acme.example",
  );
  // The Admin moved license_plate to the front and added a column of their own.
  const header = ["license_plate", "document", "approved_at", "approved_by", "delivery_id", "mileage_km", "remarks"];
  expect(sheetLayout(header, rows)).toEqual({
    added: ["vin"],
    values: [
      [
        "AB-123-C",
        "werkbon-118.pdf",
        "2026-10-06T09:30:00.000Z",
        "ann@acme.example",
        "dlv_1",
        null,
        null,
        "WVWZZZ1KZ",
      ],
    ],
  });
});

test("an empty sheet gets the whole header", () => {
  const rows = rowsOf(approved({ license_plate: "AB-123-C", lines: [{ description: "Tyre" }] }), null);
  expect(sheetLayout([], rows).added).toEqual([
    "document",
    "approved_at",
    "approved_by",
    "delivery_id",
    "license_plate",
    "lines.description",
  ]);
});
