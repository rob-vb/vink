import type { FieldValueType, Value } from "@/components/documents/field-row-view";
import type { ReviewReason, Signal } from "@/components/documents/labels";
import type { DemoDocumentId } from "./demo-papers";

/*
 * The demo's five Documents: hand-written values and confidences, not
 * pipeline output. Four wait in Needs Review; the receipt was approved by
 * Auto-Send. Demo companies only (Kantoor Noord, Hoekstra, Van Dijk, Het Anker).
 */

type Words = { en: string; nl: string };

export type SeedField = {
  key: string;
  label: Words;
  type: FieldValueType;
  required?: boolean;
  value: Value;
  readText: string | null;
  page: number;
  confidence: number;
  lowestSignal: Signal;
  reasons?: ReviewReason[];
};

export type SeedList = {
  key: string;
  label: Words;
  required: boolean;
  completeness: number;
  page: number;
  subFields: Array<{ key: string; label: Words; type: FieldValueType }>;
  entries: Array<Record<string, { value: Value; readText: string; confidence: number }>>;
};

export type SeedDocument = {
  id: DemoDocumentId;
  filename: string;
  form: Words;
  uploadedBy: Words;
  /** How long before the visitor arrived it came in. */
  minutesAgo: number;
  autoSent?: boolean;
  fields: SeedField[];
  lists?: SeedList[];
};

export const DEMO_THRESHOLD = 0.8;
export const DEMO_FORM_VERSION = 3;
/** Who the visitor is in the demo's history and badges. */
export const DEMO_USER = "demo@kantoornoord.nl";

export const seedDocuments: SeedDocument[] = [
  {
    id: "invoice",
    filename: "invoice-F-2026-0418.pdf",
    form: { en: "Invoices", nl: "Facturen" },
    uploadedBy: { en: "anouk@kantoornoord.nl", nl: "anouk@kantoornoord.nl" },
    minutesAgo: 4,
    fields: [
      { key: "supplier_name", label: { en: "Supplier", nl: "Leverancier" }, type: "text", required: true, value: "Drukkerij Hoekstra B.V.", readText: "Drukkerij Hoekstra B.V.", page: 1, confidence: 0.97, lowestSignal: "support" },
      { key: "invoice_number", label: { en: "Invoice number", nl: "Factuurnummer" }, type: "text", required: true, value: "F-2026-0418", readText: "F-2026-0418", page: 1, confidence: 0.99, lowestSignal: "match" },
      { key: "invoice_date", label: { en: "Invoice date", nl: "Factuurdatum" }, type: "date", value: "2026-09-14", readText: "14-09-2026", page: 1, confidence: 0.96, lowestSignal: "fit" },
      { key: "total_excl_vat", label: { en: "Total excl. VAT", nl: "Totaal excl. btw" }, type: "number", value: 1240, readText: "1.240,00", page: 1, confidence: 0.95, lowestSignal: "support" },
      { key: "vat_amount", label: { en: "VAT amount", nl: "Btw-bedrag" }, type: "number", value: 260.4, readText: "260,40", page: 1, confidence: 0.62, lowestSignal: "match", reasons: ["below_threshold"] },
      { key: "iban", label: { en: "IBAN", nl: "IBAN" }, type: "text", value: "NL91ABNA0417164300", readText: "NL91 ABNA 0417 1643 00", page: 1, confidence: 0.93, lowestSignal: "fit" },
    ],
  },
  {
    id: "delivery",
    filename: "pakbon-PB-77120.pdf",
    form: { en: "Delivery notes", nl: "Pakbonnen" },
    uploadedBy: { en: "sem@kantoornoord.nl", nl: "sem@kantoornoord.nl" },
    minutesAgo: 9,
    fields: [
      { key: "delivery_number", label: { en: "Delivery number", nl: "Pakbonnummer" }, type: "text", required: true, value: "PB-77120", readText: "PB-77120", page: 1, confidence: 0.94, lowestSignal: "match" },
      { key: "delivery_date", label: { en: "Delivery date", nl: "Leverdatum" }, type: "date", value: "2026-09-22", readText: "22-09-2026", page: 1, confidence: 0.91, lowestSignal: "fit" },
      { key: "customer_reference", label: { en: "Customer reference", nl: "Referentie klant" }, type: "text", value: "PO 4471", readText: "PO 4471", page: 1, confidence: 0.88, lowestSignal: "support" },
      { key: "pallets", label: { en: "Pallets", nl: "Pallets" }, type: "number", value: 6, readText: "5 6", page: 1, confidence: 0.71, lowestSignal: "fit", reasons: ["conflicting"] },
      { key: "remarks", label: { en: "Remarks", nl: "Opmerkingen" }, type: "text", value: "1 pallet corner damaged", readText: "1 pallet corner damaged", page: 2, confidence: 0.84, lowestSignal: "support" },
      { key: "received_by", label: { en: "Received by", nl: "Ontvangen door" }, type: "text", value: "M. Jansen", readText: "M. Jansen", page: 2, confidence: 0.58, lowestSignal: "match", reasons: ["unsure"] },
    ],
  },
  {
    id: "service",
    filename: "service-request-visser.pdf",
    form: { en: "Service requests", nl: "Serviceverzoeken" },
    uploadedBy: { en: "email from scanner@kantoornoord.nl", nl: "e-mail van scanner@kantoornoord.nl" },
    minutesAgo: 16,
    fields: [
      { key: "name", label: { en: "Name", nl: "Naam" }, type: "text", required: true, value: "Anouk Visser", readText: "Anouk Visser", page: 1, confidence: 0.9, lowestSignal: "support" },
      { key: "phone", label: { en: "Phone", nl: "Telefoon" }, type: "text", value: "06 1234 5b78", readText: "06 1234 5b78", page: 1, confidence: 0.66, lowestSignal: "support", reasons: ["unsure"] },
      { key: "location", label: { en: "Location", nl: "Locatie" }, type: "text", value: "2nd floor, kitchen", readText: "2nd floor, kitchen", page: 1, confidence: 0.87, lowestSignal: "fit" },
      { key: "preferred_date", label: { en: "Preferred date", nl: "Voorkeursdatum" }, type: "date", value: "2026-10-03", readText: "3 / 10", page: 1, confidence: 0.83, lowestSignal: "fit" },
      { key: "problem", label: { en: "Problem", nl: "Probleem" }, type: "text", value: "Boiler makes noise, no hot water", readText: "Boiler makes noise, no hot water", page: 1, confidence: 0.86, lowestSignal: "support" },
      { key: "urgent", label: { en: "Urgent", nl: "Spoed" }, type: "boolean", value: true, readText: "✗ Urgent", page: 1, confidence: 0.92, lowestSignal: "match" },
    ],
  },
  {
    id: "order",
    filename: "order-het-anker.pdf",
    form: { en: "Orders", nl: "Bestellingen" },
    uploadedBy: { en: "anouk@kantoornoord.nl", nl: "anouk@kantoornoord.nl" },
    minutesAgo: 23,
    fields: [
      { key: "customer", label: { en: "Customer", nl: "Klant" }, type: "text", required: true, value: "Café Het Anker", readText: "Café Het Anker", page: 1, confidence: 0.95, lowestSignal: "match" },
      { key: "order_date", label: { en: "Order date", nl: "Besteldatum" }, type: "date", value: "2026-09-28", readText: "28-09-2026", page: 1, confidence: 0.94, lowestSignal: "fit" },
      { key: "delivery_date", label: { en: "Delivery date", nl: "Leverdatum" }, type: "date", value: "2026-10-02", readText: "02-10-2026 · Wed 1/10", page: 1, confidence: 0.69, lowestSignal: "support", reasons: ["conflicting"] },
    ],
    lists: [
      {
        key: "lines",
        label: { en: "Order lines", nl: "Bestelregels" },
        required: true,
        completeness: 0.9,
        page: 1,
        subFields: [
          { key: "product", label: { en: "Product", nl: "Product" }, type: "text" },
          { key: "quantity", label: { en: "Quantity", nl: "Aantal" }, type: "number" },
        ],
        entries: [
          { product: { value: "Oat milk 1L", readText: "Oat milk 1L", confidence: 0.94 }, quantity: { value: 24, readText: "24", confidence: 0.93 } },
          { product: { value: "Espresso beans 1kg", readText: "Espresso beans 1kg", confidence: 0.92 }, quantity: { value: 6, readText: "6", confidence: 0.9 } },
          { product: { value: "Paper cups 250ml", readText: "Paper cups 250ml", confidence: 0.91 }, quantity: { value: 1000, readText: "1000", confidence: 0.88 } },
        ],
      },
    ],
  },
  {
    id: "receipt",
    filename: "bon-de-kade-0926.pdf",
    form: { en: "Expenses", nl: "Onkosten" },
    uploadedBy: { en: "email from lotte@kantoornoord.nl", nl: "e-mail van lotte@kantoornoord.nl" },
    minutesAgo: 31,
    autoSent: true,
    fields: [
      { key: "merchant", label: { en: "Merchant", nl: "Winkel" }, type: "text", value: "Lunchroom De Kade", readText: "LUNCHROOM DE KADE", page: 1, confidence: 0.96, lowestSignal: "match" },
      { key: "date", label: { en: "Date", nl: "Datum" }, type: "date", value: "2026-09-26", readText: "26-09-2026", page: 1, confidence: 0.97, lowestSignal: "fit" },
      { key: "total", label: { en: "Total", nl: "Totaal" }, type: "number", value: 24.5, readText: "24,50", page: 1, confidence: 0.98, lowestSignal: "support" },
      { key: "vat", label: { en: "VAT", nl: "Btw" }, type: "number", value: 2.02, readText: "2,02", page: 1, confidence: 0.93, lowestSignal: "fit" },
      { key: "payment", label: { en: "Payment", nl: "Betaling" }, type: "text", value: "PIN", readText: "PIN", page: 1, confidence: 0.91, lowestSignal: "match" },
    ],
  },
];
