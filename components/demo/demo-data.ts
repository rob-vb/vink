import type { FieldValueType, Value } from "@/components/documents/field-row-view";
import type { ReviewReason, Signal } from "@/components/documents/labels";
import type { DemoDocumentId, DemoPdfId, DemoPhotoId } from "./demo-papers";

/*
 * The demo's eight Documents: hand-written values and confidences, not
 * pipeline output. Six wait in Needs Review (a complaint email with a photo, a
 * damage claim email with a PDF form and two photos, and a photographed work
 * order among them); the receipt was approved by Auto-Send; a newsletter is in
 * No Form, because no Form fits it. Demo companies and people only (Kantoor
 * Noord, Hoekstra, Het Anker, De Meerkoet).
 */

type Words = { en: string; nl: string };

export type SeedField = {
  key: string;
  label: Words;
  type: FieldValueType;
  required?: boolean;
  /** A choice Field's options: the Form's own words, so the same in both languages. */
  options?: string[];
  /** A value in both languages (`Words`) is one Vink wrote itself, e.g. what it saw in a photo; a value read off a paper is that paper's own words. */
  value: Value | Words;
  readText: string | Words | null;
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
  entries: Array<Record<string, { value: Value; readText: string; confidence: number; reasons?: ReviewReason[] }>>;
};

/** An email Document: the email's headers and body, and its attachments (each a drawn photo or drawn PDF pages). */
export type SeedEmail = {
  from: string;
  /** ISO, so the pane shows it like the app does. */
  date: string;
  /** The read text of every value read on the body appears in it word for word, in both languages. */
  body: Words;
  attachments: SeedAttachment[];
};

export type SeedAttachment =
  | { filename: string; mimeType: string; photo: DemoPhotoId; alt: Words }
  | { filename: string; mimeType: "application/pdf"; pdf: DemoPdfId };

/** A seed value in the visitor's language; a plain value is the same in both. */
export function inLocale<T extends Value>(value: T | Words, locale: "en" | "nl"): T {
  return value !== null && typeof value === "object" ? (value[locale] as T) : value;
}

export type SeedDocument = {
  id: DemoDocumentId;
  /** An email's name is its subject. */
  filename: string;
  /** A PDF unless said otherwise. */
  kind?: "email" | "image";
  email?: SeedEmail;
  /** The picture of a photo Document, described for the alt text. */
  photoAlt?: Words;
  /** Vink's pick of the Form for input that came without one: its probability. The history shows "Form picked". */
  routed?: number;
  /** In No Form, because the Router's pick (this Form) did not fit: the history says "Does not fit …". */
  noForm?: Words;
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

/** The damage claim email's text, word for word what the customer typed. */
const CLAIM_BODY =
  "Beste mevrouw, meneer,\n\nAfgelopen zaterdag hebben we waterschade gehad in de keuken en de woonkamer. Bijgaand het schadeformulier en twee foto's. Ons polisnummer is WH-2048-7731.\n\nKunt u laten weten of er een expert langskomt?\n\nMet vriendelijke groet,\nMarieke Bosman";

/** The claim form's table of damaged items: as typed, and how sure Vink is of the year. */
export const CLAIM_ITEMS: Array<[string, string, string, string, number]> = [
  ["Laminaat woonkamer (24 m²)", "± 2019", "1.150,00", "860,00", 0.72],
  ["Onderkast keuken", "2017", "640,00", "410,00", 0.93],
  ["Vloerkleed", "2022", "320,00", "240,00", 0.94],
  ["Plinten en ondervloer", "2019", "210,00", "175,00", 0.92],
];

/** A Dutch amount as typed ("1.150,00") as a number. */
const amount = (typed: string) => Number(typed.replace(/\./g, "").replace(",", "."));

export const seedDocuments: SeedDocument[] = [
  {
    id: "complaint",
    filename: "Espressomachine lekt (ORD-3318)",
    kind: "email",
    form: { en: "Complaints", nl: "Klachten" },
    uploadedBy: { en: "email from sanne@hetanker.nl", nl: "e-mail van sanne@hetanker.nl" },
    minutesAgo: 2,
    routed: 0.94,
    email: {
      from: "Sanne de Vries <sanne@hetanker.nl>",
      date: "2026-09-30T06:18:00Z",
      body: {
        en: "Hello,\n\nOn 21-09-2026 we bought the espresso machine Lumo E2 (order ORD-3318). After one week it started to leak: every morning there is a puddle under the machine. I attached a photo.\n\nCan you repair it or send a replacement? Our terrace is open and we cannot serve coffee without it.\n\nKind regards,\nSanne de Vries\nCafé Het Anker",
        nl: "Goedemiddag,\n\nOp 21-09-2026 hebben we de espressomachine Lumo E2 gekocht (bestelling ORD-3318). Na een week begon hij te lekken: elke ochtend staat er een plas water onder de machine. Ik heb een foto bijgevoegd.\n\nKunnen jullie hem repareren of een vervangende sturen? Ons terras is open en zonder machine kunnen we geen koffie schenken.\n\nMet vriendelijke groet,\nSanne de Vries\nCafé Het Anker",
      },
      attachments: [
        {
          filename: "espressomachine-lekt.jpg",
          mimeType: "image/jpeg",
          photo: "complaint",
          alt: {
            en: "Photo of an espresso machine on a counter with a puddle of water under it",
            nl: "Foto van een espressomachine op een aanrecht met een plas water eronder",
          },
        },
      ],
    },
    fields: [
      { key: "name", label: { en: "Name", nl: "Naam" }, type: "text", required: true, value: "Sanne de Vries", readText: "Sanne de Vries", page: 1, confidence: 0.96, lowestSignal: "support" },
      { key: "customer", label: { en: "Customer", nl: "Klant" }, type: "text", value: "Café Het Anker", readText: "Café Het Anker", page: 1, confidence: 0.95, lowestSignal: "match" },
      { key: "order_number", label: { en: "Order number", nl: "Bestelnummer" }, type: "text", required: true, value: "ORD-3318", readText: "ORD-3318", page: 1, confidence: 0.78, lowestSignal: "fit", reasons: ["below_threshold"] },
      { key: "order_date", label: { en: "Order date", nl: "Besteldatum" }, type: "date", value: "2026-09-21", readText: "21-09-2026", page: 1, confidence: 0.94, lowestSignal: "fit" },
      { key: "product", label: { en: "Product", nl: "Product" }, type: "text", value: "Lumo E2", readText: "Lumo E2", page: 1, confidence: 0.91, lowestSignal: "support" },
      { key: "problem", label: { en: "Problem seen", nl: "Probleem op de foto" }, type: "text", value: { en: "Puddle under the machine", nl: "Plas water onder de machine" }, readText: { en: "Puddle under the machine", nl: "Plas water onder de machine" }, page: 2, confidence: 0.74, lowestSignal: "support", reasons: ["below_threshold"] },
    ],
  },
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
    id: "workorder",
    filename: "werkbon-0212.jpg",
    kind: "image",
    form: { en: "Work orders", nl: "Werkbonnen" },
    uploadedBy: { en: "sem@kantoornoord.nl", nl: "sem@kantoornoord.nl" },
    minutesAgo: 6,
    routed: 0.91,
    photoAlt: {
      en: "Photo of a handwritten work order on a wooden table",
      nl: "Foto van een handgeschreven werkbon op een houten tafel",
    },
    fields: [
      { key: "customer", label: { en: "Customer", nl: "Klant" }, type: "text", required: true, value: "Café Het Anker", readText: "Café Het Anker", page: 1, confidence: 0.93, lowestSignal: "match" },
      { key: "work_date", label: { en: "Date", nl: "Datum" }, type: "date", value: "2026-09-30", readText: "30/9/26", page: 1, confidence: 0.9, lowestSignal: "fit" },
      { key: "work", label: { en: "Work done", nl: "Uitgevoerd werk" }, type: "text", value: "Kraan vervangen", readText: "Kraan vervangen", page: 1, confidence: 0.88, lowestSignal: "support" },
      { key: "hours", label: { en: "Hours", nl: "Uren" }, type: "number", value: 2.5, readText: "2,5 u", page: 1, confidence: 0.64, lowestSignal: "fit", reasons: ["unsure"] },
      { key: "materials", label: { en: "Materials", nl: "Materiaal" }, type: "text", value: "mengkraan + slangen", readText: "mengkraan + slangen", page: 1, confidence: 0.86, lowestSignal: "support" },
    ],
  },
  {
    id: "claim",
    filename: "Schademelding waterschade WH-2048-7731",
    kind: "email",
    form: { en: "Damage claims", nl: "Schademeldingen" },
    uploadedBy: { en: "email from marieke.bosman@mailbox.nl", nl: "e-mail van marieke.bosman@mailbox.nl" },
    minutesAgo: 9,
    routed: 0.93,
    // What the customer sent is Dutch, whatever the visitor's language.
    email: {
      from: "Marieke Bosman <marieke.bosman@mailbox.nl>",
      date: "2026-09-30T06:05:00Z",
      body: {
        en: CLAIM_BODY,
        nl: CLAIM_BODY,
      },
      attachments: [
        { filename: "schademeldingsformulier.pdf", mimeType: "application/pdf", pdf: "claim" },
        {
          filename: "laminaat-woonkamer.jpg",
          mimeType: "image/jpeg",
          photo: "claimFloor",
          alt: {
            en: "Photo of a wet laminate floor with swollen, raised seams",
            nl: "Foto van een nat laminaat met opgezwollen, omhoog staande naden",
          },
        },
        {
          filename: "onderkast-keuken.jpg",
          mimeType: "image/jpeg",
          photo: "claimCabinet",
          alt: {
            en: "Photo of the base of a kitchen cabinet with a dark water stain",
            nl: "Foto van de onderkant van een keukenkast met een donkere watervlek",
          },
        },
      ],
    },
    fields: [
      { key: "policy_number", label: { en: "Policy number", nl: "Polisnummer" }, type: "text", required: true, value: "WH-2048-7731", readText: "WH-2048-7731", page: 1, confidence: 0.97, lowestSignal: "match" },
      { key: "insured_name", label: { en: "Insured name", nl: "Naam verzekerde" }, type: "text", required: true, value: "Marieke Bosman", readText: "Marieke Bosman", page: 2, confidence: 0.96, lowestSignal: "support" },
      { key: "risk_address", label: { en: "Risk address", nl: "Risicoadres" }, type: "text", value: "Klaprooslaan 14, 3824 XK Amersfoort", readText: "Klaprooslaan 14, 3824 XK Amersfoort", page: 2, confidence: 0.94, lowestSignal: "fit" },
      { key: "damage_date", label: { en: "Date of damage", nl: "Schadedatum" }, type: "date", required: true, value: "2026-09-27", readText: "27-09-2026", page: 2, confidence: 0.95, lowestSignal: "fit" },
      { key: "cause", label: { en: "Cause", nl: "Oorzaak" }, type: "choice", options: ["Lekkage leiding", "Wasmachine of vaatwasser", "Neerslag", "Overig"], value: "Wasmachine of vaatwasser", readText: "mogelijk de afvoer van de vaatwasser", page: 2, confidence: 0.66, lowestSignal: "support", reasons: ["unsure"] },
      { key: "description", label: { en: "Description", nl: "Toelichting" }, type: "text", value: "Zaterdagochtend stond er water onder het aanrecht en in de woonkamer. Het water kwam onder de keukenkast vandaan, mogelijk de afvoer van de vaatwasser.", readText: "Zaterdagochtend stond er water onder het aanrecht en in de woonkamer. Het water kwam onder de keukenkast vandaan, mogelijk de afvoer van de vaatwasser.", page: 2, confidence: 0.9, lowestSignal: "support" },
      { key: "total_claimed", label: { en: "Total claimed", nl: "Totaal geclaimd" }, type: "number", required: true, value: 1685, readText: "1.685,00", page: 2, confidence: 0.96, lowestSignal: "match" },
      { key: "iban", label: { en: "IBAN", nl: "IBAN" }, type: "text", value: "NL91ABNA0417164300", readText: "NL91 ABNA 0417 1643 00", page: 2, confidence: 0.95, lowestSignal: "fit" },
      { key: "photos_attached", label: { en: "Photos attached", nl: "Foto's bijgevoegd" }, type: "boolean", value: true, readText: "☒ Ja", page: 2, confidence: 0.93, lowestSignal: "match" },
    ],
    lists: [
      {
        key: "damaged_items",
        label: { en: "Damaged items", nl: "Beschadigde zaken" },
        required: true,
        completeness: 0.92,
        page: 2,
        subFields: [
          { key: "description", label: { en: "Description", nl: "Omschrijving" }, type: "text" },
          { key: "purchase_year", label: { en: "Year bought", nl: "Aanschafjaar" }, type: "number" },
          { key: "purchase_value", label: { en: "Purchase value", nl: "Aanschafwaarde" }, type: "number" },
          { key: "claimed", label: { en: "Amount claimed", nl: "Geclaimd bedrag" }, type: "number" },
        ],
        entries: CLAIM_ITEMS.map(([description, year, value, claimed, yearConfidence]) => ({
          description: { value: description, readText: description, confidence: 0.95 },
          purchase_year: {
            value: Number(year.replace(/\D/g, "")),
            readText: year,
            confidence: yearConfidence,
            ...(yearConfidence < DEMO_THRESHOLD ? { reasons: ["below_threshold" as const] } : {}),
          },
          purchase_value: { value: amount(value), readText: value, confidence: 0.94 },
          claimed: { value: amount(claimed), readText: claimed, confidence: 0.94 },
        })),
      },
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
      { key: "phone", label: { en: "Phone", nl: "Telefoon" }, type: "text", value: "050 311 2044", readText: "050 311 2040 · New no. 050 311 2044", page: 1, confidence: 0.69, lowestSignal: "support", reasons: ["conflicting"] },
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
  {
    id: "newsletter",
    filename: "Herfstacties Groothandel Bakker",
    kind: "email",
    form: { en: "", nl: "" },
    uploadedBy: { en: "email from news@groothandelbakker.nl", nl: "e-mail van news@groothandelbakker.nl" },
    minutesAgo: 12,
    noForm: { en: "Invoices", nl: "Facturen" },
    email: {
      from: "Groothandel Bakker <news@groothandelbakker.nl>",
      date: "2026-09-30T05:55:00Z",
      body: {
        en: "Autumn offers at Groothandel Bakker\n\nThis week: paper cups 250 ml at 8% off, and a free bag of beans with orders over 150 euro.\n\nSee all offers on our website. You receive this newsletter because you are a customer.",
        nl: "Herfstacties bij Groothandel Bakker\n\nDeze week: koffiebekers 250 ml met 8% korting, en een gratis zak bonen bij bestellingen boven 150 euro.\n\nBekijk alle acties op onze website. Je ontvangt deze nieuwsbrief omdat je klant bent.",
      },
      attachments: [],
    },
    fields: [],
  },
];
