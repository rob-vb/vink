import { Caveat } from "next/font/google";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Four hand-written example documents (never tyre reports), with the Field
// Values Vink would show for them. The review mocks use them exactly like the
// app's review screen: "Read on page N" plus the read text, confidence to two
// decimals, never a highlighted region.

const hand = Caveat({ subsets: ["latin"], weight: ["500", "600"], display: "swap" });

export type SampleField = {
  key: string;
  label: string;
  value: string;
  read: string | null;
  page: number;
  confidence: number;
  reasons?: string;
  checked?: boolean;
};

export type SampleDocument = {
  id: "invoice" | "deliveryNote" | "handwritten" | "orderForm";
  file: string;
  form: string;
  version: number;
  pages: number;
  fields: SampleField[];
  paper: ReactNode;
};

export const REVIEW_THRESHOLD = 0.8;

function Paper({
  children,
  className,
  variant = "clean",
}: {
  children: ReactNode;
  className?: string;
  variant?: "clean" | "scan" | "fax";
}) {
  return (
    <div
      className={cn(
        "relative aspect-[1/1.414] w-full overflow-hidden border border-[#d9dde3] bg-white p-5 text-[11px] leading-snug text-[#1d2433] shadow-[0_1px_2px_rgba(15,30,54,0.06),0_8px_24px_-12px_rgba(15,30,54,0.25)]",
        variant === "scan" && "-rotate-[0.8deg] bg-[#f4f4f1] contrast-105 grayscale",
        variant === "fax" && "bg-[#f7f7f4] font-mono contrast-125 grayscale",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Head({ name, aside }: { name: string; aside: ReactNode }) {
  return (
    <div className="mb-2.5 flex justify-between gap-2 border-b border-[#d9dde3] pb-2">
      <b className="text-[12px]">{name}</b>
      <span className="text-right text-[9px] text-[#6b7280]">{aside}</span>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-3 border-b border-dotted border-[#d9dde3] py-[3px] tabular-nums", className)}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-[22px] items-end gap-2 border-b border-[#9aa0a8]">
      <small className="text-[9px] whitespace-nowrap text-[#6b7280]">{label}</small>
      {children}
    </div>
  );
}

function Hand({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn(hand.className, "text-[18px] leading-none text-[#1f3a8a]", className)}>{children}</span>;
}

function Foot({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-x-5 bottom-3 border-t border-[#d9dde3] pt-1.5 text-[9px] text-[#6b7280]">
      {children}
    </div>
  );
}

export const sampleDocuments: SampleDocument[] = [
  {
    id: "invoice",
    file: "invoice-F-2026-0418.pdf",
    form: "Invoices",
    version: 3,
    pages: 1,
    paper: (
      <Paper>
        <Head name="Drukkerij Hoekstra B.V." aside={<>Industrieweg 14<br />3542 AD Utrecht</>} />
        <p className="mb-2.5 text-[14px] font-bold tracking-[0.14em]">INVOICE</p>
        <dl className="mb-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-[#6b7280]">Invoice no.</dt><dd>F-2026-0418</dd>
          <dt className="text-[#6b7280]">Date</dt><dd>14-09-2026</dd>
          <dt className="text-[#6b7280]">Customer</dt><dd>Kantoor Noord B.V.</dd>
        </dl>
        <div className="flex justify-between border-b border-[#d9dde3] py-[3px] font-semibold"><span>Description</span><span>Amount</span></div>
        <Row label="Flyers A5, 5,000" value="740,00" />
        <Row label="Posters A2, 200" value="500,00" />
        <Row label="Subtotal" value="1.240,00" />
        <Row label="VAT 21%" value={<span className="opacity-75 blur-[0.6px]">260,40</span>} />
        <Row label="Total" value="1.500,40" className="font-bold" />
        <Foot>IBAN NL91 ABNA 0417 1643 00 · Payment within 30 days</Foot>
      </Paper>
    ),
    fields: [
      { key: "supplier_name", label: "Supplier", value: "Drukkerij Hoekstra B.V.", read: "Drukkerij Hoekstra B.V.", page: 1, confidence: 0.97 },
      { key: "invoice_number", label: "Invoice number", value: "F-2026-0418", read: "F-2026-0418", page: 1, confidence: 0.99 },
      { key: "invoice_date", label: "Invoice date", value: "2026-09-14", read: "14-09-2026", page: 1, confidence: 0.96 },
      { key: "total_excl_vat", label: "Total excl. VAT", value: "1240.00", read: "1.240,00", page: 1, confidence: 0.95 },
      { key: "vat_amount", label: "VAT amount", value: "260.40", read: "260,40", page: 1, confidence: 0.62, reasons: "Below threshold · lowest signal: Match" },
      { key: "iban", label: "IBAN", value: "NL91ABNA0417164300", read: "NL91 ABNA 0417 1643 00", page: 1, confidence: 0.93 },
    ],
  },
  {
    id: "deliveryNote",
    file: "pakbon-PB-77120.pdf",
    form: "Delivery notes",
    version: 2,
    pages: 1,
    paper: (
      <Paper variant="scan">
        <Head name="Van Dijk Logistiek" aside={<>Havenweg 3<br />Rotterdam</>} />
        <p className="mb-2.5 text-[13px] font-bold tracking-[0.12em]">PAKBON · DELIVERY NOTE</p>
        <dl className="mb-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-[#6b7280]">No.</dt><dd>PB-77120</dd>
          <dt className="text-[#6b7280]">Date</dt><dd>22-09-2026</dd>
          <dt className="text-[#6b7280]">Your ref.</dt><dd>PO 4471</dd>
        </dl>
        <div className="flex justify-between border-b border-[#d9dde3] py-[3px] font-semibold"><span>Item</span><span>Qty</span></div>
        <Row label="Pallets, mixed goods" value={<><s>5</s> <Hand>6</Hand></>} />
        <Row label="Returned crates" value="12" />
        <div className="mt-4">
          <Line label="Received by"><Hand className="inline-block -rotate-3">M. Jansen</Hand></Line>
        </div>
        <span className="absolute right-4 bottom-10 -rotate-[8deg] border-2 border-[#b91c1c] px-2 py-1 text-[10px] font-bold tracking-[0.1em] text-[#b91c1c] opacity-70">RECEIVED</span>
        <Foot>Page 1 of 1</Foot>
      </Paper>
    ),
    fields: [
      { key: "delivery_number", label: "Delivery number", value: "PB-77120", read: "PB-77120", page: 1, confidence: 0.94 },
      { key: "delivery_date", label: "Delivery date", value: "2026-09-22", read: "22-09-2026", page: 1, confidence: 0.91 },
      { key: "customer_reference", label: "Customer reference", value: "PO 4471", read: "PO 4471", page: 1, confidence: 0.88 },
      { key: "pallets", label: "Pallets", value: "6", read: "5 6", page: 1, confidence: 0.71, reasons: "Conflicting readings · lowest signal: Jev fit" },
      { key: "received_by", label: "Received by", value: "M. Jansen", read: "M. Jansen", page: 1, confidence: 0.58, reasons: "Read as unsure · lowest signal: Match" },
    ],
  },
  {
    id: "handwritten",
    file: "service-request-visser.pdf",
    form: "Service requests",
    version: 1,
    pages: 1,
    paper: (
      <Paper>
        <Head name="Service request" aside="Please write clearly" />
        <Line label="Name"><Hand>Anouk Visser</Hand></Line>
        <Line label="Phone"><Hand>06 1234 5b78</Hand></Line>
        <Line label="Address"><Hand>Kerkstraat 12, Utrecht</Hand></Line>
        <Line label="Preferred date"><Hand>3 / 10</Hand></Line>
        <Line label="What's wrong?"><Hand className="text-[15px]">Boiler makes noise, no hot water</Hand></Line>
        <p className="mt-2.5 flex items-center gap-1.5">
          <span className="relative inline-block size-3 border border-[#444]">
            <Hand className="absolute -top-2 left-0 text-[20px]">✗</Hand>
          </span>
          Urgent
          <span className="ml-3 inline-block size-3 border border-[#444]" /> Can wait
        </p>
        <Foot>Form SR-2 · scanned 30-09-2026</Foot>
      </Paper>
    ),
    fields: [
      { key: "name", label: "Name", value: "Anouk Visser", read: "Anouk Visser", page: 1, confidence: 0.9 },
      { key: "phone", label: "Phone", value: "06 1234 5678", read: "06 1234 5b78", page: 1, confidence: 0.66, reasons: "Doesn't fit the type · lowest signal: Jev support" },
      { key: "address", label: "Address", value: "Kerkstraat 12, Utrecht", read: "Kerkstraat 12, Utrecht", page: 1, confidence: 0.87 },
      { key: "preferred_date", label: "Preferred date", value: "2026-10-03", read: "3 / 10", page: 1, confidence: 0.83 },
      { key: "urgent", label: "Urgent", value: "Yes", read: "☒ Urgent", page: 1, confidence: 0.92 },
    ],
  },
  {
    id: "orderForm",
    file: "order-het-anker.pdf",
    form: "Orders",
    version: 4,
    pages: 1,
    paper: (
      <Paper variant="fax">
        <Head name="ORDER FORM" aside={<>FAX 010-5550123<br />28-09-26 14:02</>} />
        <dl className="mb-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-[#6b7280]">Customer</dt><dd>Café Het Anker</dd>
          <dt className="text-[#6b7280]">Order date</dt><dd>28-09-2026</dd>
          <dt className="text-[#6b7280]">Delivery</dt><dd>02-10-2026</dd>
        </dl>
        <div className="flex justify-between border-b border-[#d9dde3] py-[3px] font-semibold"><span>Product</span><span>Qty</span></div>
        <Row label="Oat milk 1L" value="24" />
        <Row label="Espresso beans 1kg" value="6" />
        <Row label="Paper cups 250ml" value="1000" />
        <p className="mt-3"><Hand className="text-[17px]">Please deliver Wed 1/10</Hand></p>
        <Foot>Page 1/1</Foot>
      </Paper>
    ),
    fields: [
      { key: "customer", label: "Customer", value: "Café Het Anker", read: "Café Het Anker", page: 1, confidence: 0.95 },
      { key: "order_date", label: "Order date", value: "2026-09-28", read: "28-09-2026", page: 1, confidence: 0.94 },
      { key: "delivery_date", label: "Delivery date", value: "2026-10-02", read: "02-10-2026", page: 1, confidence: 0.69, reasons: "Conflicting readings · lowest signal: Jev support" },
    ],
  },
];

export function sampleDocument(id: SampleDocument["id"]) {
  return sampleDocuments.find((d) => d.id === id)!;
}
