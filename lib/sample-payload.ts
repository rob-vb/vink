// A real Payload envelope, in the exact shape convex/lib/payload.ts
// (envelopeOf) builds, for a demo Form "Invoices" with a List Field. Home's
// "Two ways to connect it" and the Developers page both show it.

export const sampleEnvelope = {
  event: "submission.approved",
  delivery_id: "dlv_3f6c2a1e-8b4d-4e2f-9a71-5c0d8e7b2f14",
  test: false,
  submission: {
    id: "k97d4m2x8q1v6c3n5b0e7h9r2t4w8a1f",
    filename: "invoice-F-2026-0418.pdf",
    uploaded_at: "2026-09-30T08:12:04.000Z",
  },
  form: { id: "jd72k9m3x5q8v1c4n6b0e3h7r2t9w5as", version: 3 },
  approval: {
    mode: "manual",
    by: "k1754bq2m9x6c8v3n0b5e7h1r4t2w6yd",
    at: "2026-09-30T08:14:51.000Z",
  },
  data: {
    supplier_name: "Drukkerij Hoekstra B.V.",
    invoice_number: "F-2026-0418",
    invoice_date: "2026-09-14",
    purchase_order: null,
    total_excl_vat: 1240,
    vat_amount: 260.4,
    iban: "NL91ABNA0417164300",
    paid: false,
    lines: [
      { description: "Flyers A5, 5,000", quantity: 5000, amount: 740 },
      { description: "Posters A2, 200", quantity: 200, amount: 500 },
    ],
    credit_notes: [],
  },
};

export const sampleEnvelopeJson = JSON.stringify(sampleEnvelope, null, 2);
