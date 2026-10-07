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

test("values go under their column, by name; a new Field gets a column just before approved_at, null an empty cell", () => {
  const rows = rowsOf(
    approved({ license_plate: "AB-123-C", mileage_km: null, vin: "WVWZZZ1KZ", lines: [] }),
    "ann@acme.example",
  );
  // The Admin moved license_plate to the front and added a column of their own.
  const header = ["license_plate", "document", "mileage_km", "approved_at", "approved_by", "delivery_id", "remarks"];
  expect(sheetLayout(header, rows)).toEqual({
    inserts: [{ index: 3, name: "vin" }],
    values: [
      [
        "AB-123-C",
        "werkbon-118.pdf",
        null,
        "WVWZZZ1KZ",
        "2026-10-06T09:30:00.000Z",
        "ann@acme.example",
        "dlv_1",
        null,
      ],
    ],
  });
});

test("an empty sheet gets the whole header: document, the Fields, then Vink's three columns", () => {
  const rows = rowsOf(approved({ license_plate: "AB-123-C", lines: [{ description: "Tyre" }] }), null);
  const { inserts } = sheetLayout([], rows);
  expect(inserts.map((i) => i.name)).toEqual([
    "document",
    "license_plate",
    "lines.description",
    "approved_at",
    "approved_by",
    "delivery_id",
  ]);
  expect(inserts.map((i) => i.index)).toEqual([0, 1, 2, 3, 4, 5]);
});

test("new Fields on a sheet in the new order go before approved_at, in the Form's order", () => {
  const rows = rowsOf(approved({ invoice_number: "F-2026-0042", supplier: "Bakker BV", total: 1210.5 }), "ann@acme.example");
  const header = ["document", "invoice_number", "approved_at", "approved_by", "delivery_id"];
  expect(sheetLayout(header, rows)).toEqual({
    inserts: [
      { index: 2, name: "supplier" },
      { index: 3, name: "total" },
    ],
    values: [
      ["werkbon-118.pdf", "F-2026-0042", "Bakker BV", 1210.5, "2026-10-06T09:30:00.000Z", "ann@acme.example", "dlv_1"],
    ],
  });
});

test("a sheet in the old order keeps its columns; a new Field goes just before approved_at", () => {
  const rows = rowsOf(approved({ invoice_number: "F-2026-0042", supplier: "Bakker BV", total: 1210.5 }), "ann@acme.example");
  const header = ["document", "approved_at", "approved_by", "delivery_id", "invoice_number", "total"];
  expect(sheetLayout(header, rows)).toEqual({
    inserts: [{ index: 1, name: "supplier" }],
    values: [
      ["werkbon-118.pdf", "Bakker BV", "2026-10-06T09:30:00.000Z", "ann@acme.example", "dlv_1", "F-2026-0042", 1210.5],
    ],
  });
});

test("without an approved_at column, a new Field goes before the next of Vink's columns, or on the right", () => {
  const rows = rowsOf(approved({ invoice_number: "F-2026-0042" }), null);
  expect(sheetLayout(["document", "approved_by", "delivery_id"], rows).inserts).toEqual([
    { index: 1, name: "invoice_number" },
    { index: 4, name: "approved_at" },
  ]);
  expect(sheetLayout(["notes"], rows).inserts.map((i) => i.name)).toEqual([
    "document",
    "invoice_number",
    "approved_at",
    "approved_by",
    "delivery_id",
  ]);
});

test("a Field keyed like one of Vink's own columns gets a column of its own; Vink's columns are never overwritten", () => {
  const [row] = rowsOf(
    approved({ document: "Werkbon", delivery_id: "PO-77", approved_by: "Jan", approved_at: "2026-10-01" }),
    "ann@acme.example",
  );
  expect(row).toEqual({
    document: "werkbon-118.pdf",
    approved_at: "2026-10-06T09:30:00.000Z",
    approved_by: "ann@acme.example",
    delivery_id: "dlv_1",
    "document (Field)": "Werkbon",
    "delivery_id (Field)": "PO-77",
    "approved_by (Field)": "Jan",
    "approved_at (Field)": "2026-10-01",
  });
});
