import { Caveat } from "next/font/google";
import type { ReactNode } from "react";
import { cn } from "cn";

// Handwriting on the demo's paper pages.
const hand = Caveat({ subsets: ["latin"], weight: ["500", "600"], preload: false });

/*
 * The demo Documents' pages, drawn in HTML. They are paper: fixed light
 * colours that stay light in dark mode, like a real PDF. Every page is laid
 * out at PAPER_WIDTH and scaled to fit by the PDF pane.
 */

export const PAPER_WIDTH = 440;

const ink = "text-[#1D2433]";
const faint = "text-[#6B7280]";
const pen = cn(hand.className, "text-[#1F3A8A] leading-none");

function Paper({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[1/1.414] overflow-hidden border border-[#D9DDE3] bg-white p-7 text-[12px] leading-[1.45] shadow-[0_1px_2px_rgba(15,30,54,.06),0_8px_24px_-12px_rgba(15,30,54,.25)]",
        ink,
        className,
      )}
      style={{ width: PAPER_WIDTH, ...style }}
    >
      {children}
    </div>
  );
}

function Head({ name, lines }: { name: string; lines: string[] }) {
  return (
    <div className="mb-3 flex justify-between gap-2 border-b border-[#D9DDE3] pb-2.5">
      <b className="text-[14px]">{name}</b>
      <span className={cn("text-right text-[10px]", faint)}>
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </span>
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <div className="mb-3 text-[15px] font-bold tracking-[0.14em]">{children}</div>;
}

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className={faint}>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Lines({ head, rows }: { head: [string, string]; rows: Array<[ReactNode, ReactNode]> }) {
  return (
    <table className="mb-3 w-full border-collapse tabular-nums">
      <thead>
        <tr>
          <th className="border-b border-[#D9DDE3] py-1 text-left font-semibold">{head[0]}</th>
          <th className="border-b border-[#D9DDE3] py-1 text-right font-semibold">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([a, b], i) => (
          <tr key={i}>
            <td className="border-b border-dotted border-[#D9DDE3] py-1">{a}</td>
            <td className="border-b border-dotted border-[#D9DDE3] py-1 text-right">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Foot({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "absolute inset-x-7 bottom-4 border-t border-[#D9DDE3] pt-1.5 text-[10px]",
        faint,
      )}
    >
      {children}
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-7 items-end gap-2 border-b border-[#9AA0A8]">
      <small className={cn("text-[10px] whitespace-nowrap", faint)}>{label}</small>
      {children}
    </div>
  );
}

function InvoicePage() {
  return (
    <Paper>
      <Head name="Drukkerij Hoekstra B.V." lines={["Industrieweg 14", "3542 AD Utrecht"]} />
      <Title>INVOICE</Title>
      <Facts
        rows={[
          ["Invoice no.", "F-2026-0418"],
          ["Date", "14-09-2026"],
          ["Customer", "Kantoor Noord B.V."],
        ]}
      />
      <Lines
        head={["Description", "Amount"]}
        rows={[
          ["Flyers A5, 5,000", "740,00"],
          ["Posters A2, 200", "500,00"],
          ["Subtotal", "1.240,00"],
          ["VAT 21%", <span key="vat" className="opacity-75 blur-[0.7px]">260,40</span>],
          [<b key="t">Total</b>, <b key="a">1.500,40</b>],
        ]}
      />
      <Foot>IBAN NL91 ABNA 0417 1643 00 · Payment within 30 days</Foot>
    </Paper>
  );
}

const scan = "bg-[#F4F4F1] grayscale-[1] contrast-[1.05]";

function DeliveryPage1() {
  return (
    <Paper className={scan} style={{ transform: "rotate(-0.6deg)" }}>
      <Head name="Van Dijk Logistiek" lines={["Havenweg 3", "Rotterdam"]} />
      <Title>PAKBON · DELIVERY NOTE</Title>
      <Facts
        rows={[
          ["No.", "PB-77120"],
          ["Date", "22-09-2026"],
          ["Your ref.", "PO 4471"],
          ["Deliver to", "Kantoor Noord B.V."],
        ]}
      />
      <Lines
        head={["Item", "Qty"]}
        rows={[
          [
            "Pallets, mixed goods",
            <span key="q">
              <s>5</s> <span className={cn(pen, "text-[19px]")}>6</span>
            </span>,
          ],
          ["Returned crates", "12"],
        ]}
      />
      <Foot>Page 1 of 2 · continued overleaf</Foot>
    </Paper>
  );
}

function DeliveryPage2() {
  return (
    <Paper className={scan} style={{ transform: "rotate(0.4deg)" }}>
      <Title>RECEIPT OF GOODS</Title>
      <p className="mb-4">Goods received in good order, unless noted below.</p>
      <Line label="Remarks">
        <span className={cn(pen, "text-[17px]")}>1 pallet corner damaged</span>
      </Line>
      <Line label="Received by">
        <span className={cn(pen, "inline-block -rotate-3 text-[20px]")}>M. Jansen</span>
      </Line>
      <Line label="Date / time">
        <span className={cn(pen, "text-[19px]")}>22/9 · 10:40</span>
      </Line>
      <div className="absolute right-6 bottom-12 -rotate-6 border-2 border-[#B91C1C] px-2 py-1 text-[11px] font-bold tracking-[0.1em] text-[#B91C1C] opacity-70">
        RECEIVED
      </div>
      <Foot>Page 2 of 2</Foot>
    </Paper>
  );
}

function ServiceRequestPage() {
  return (
    <Paper>
      <Head name="Service request" lines={["Kantoor Noord Facilities", "Please write clearly"]} />
      <Line label="Name">
        <span className={cn(pen, "text-[20px]")}>Anouk Visser</span>
      </Line>
      <Line label="Phone">
        <span className={cn(pen, "text-[20px]")}>06 1234 5b78</span>
      </Line>
      <Line label="Location">
        <span className={cn(pen, "text-[20px]")}>2nd floor, kitchen</span>
      </Line>
      <Line label="Preferred date">
        <span className={cn(pen, "text-[20px]")}>3 / 10</span>
      </Line>
      <Line label="What's wrong?">
        <span className={cn(pen, "text-[17px]")}>Boiler makes noise, no hot water</span>
      </Line>
      <p className="mt-3 flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="relative inline-block size-3 border border-[#444]">
            <span className={cn(pen, "absolute -top-2 left-0 text-[20px] font-semibold")}>✗</span>
          </span>
          Urgent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 border border-[#444]" />
          Can wait
        </span>
      </p>
      <Foot>Form SR-2 · scanned 30-09-2026</Foot>
    </Paper>
  );
}

function OrderPage() {
  return (
    <Paper className="bg-[#F7F7F4] font-mono grayscale-[1] contrast-[1.2]">
      <Head name="ORDER FORM" lines={["FAX 010-5550123", "28-09-26 14:02"]} />
      <Facts
        rows={[
          ["Customer", "Café Het Anker"],
          ["Order date", "28-09-2026"],
          ["Delivery", "02-10-2026"],
        ]}
      />
      <Lines
        head={["Product", "Qty"]}
        rows={[
          ["Oat milk 1L", "24"],
          ["Espresso beans 1kg", "6"],
          ["Paper cups 250ml", "1000"],
        ]}
      />
      <p className={cn(pen, "text-[19px]")}>Please deliver Wed 1/10</p>
      <Foot>Page 1/1</Foot>
    </Paper>
  );
}

function ReceiptPage() {
  return (
    <Paper className="flex justify-center bg-[#EEF0F2] p-6 shadow-none">
      <div className="w-[250px] bg-[#FBFBF8] px-4 py-5 text-center font-mono text-[11.5px] shadow-[0_8px_24px_-12px_rgba(15,30,54,.35)]">
        <b className="text-[14px]">LUNCHROOM DE KADE</b>
        <div className="text-[10px]">Oudegracht 88, Utrecht</div>
        <table className="mt-4 w-full text-left">
          <tbody>
            {[
              ["Koffie 3x", "9,60"],
              ["Broodje kaas 2x", "11,00"],
              ["Jus d'orange", "3,90"],
            ].map(([a, b]) => (
              <tr key={a}>
                <td>{a}</td>
                <td className="text-right">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-2 border-0 border-t border-dashed border-[#999]" />
        <table className="w-full text-left">
          <tbody>
            <tr>
              <td>
                <b>TOTAAL</b>
              </td>
              <td className="text-right">
                <b>24,50</b>
              </td>
            </tr>
            <tr>
              <td>BTW 9%</td>
              <td className="text-right">2,02</td>
            </tr>
            <tr>
              <td>PIN</td>
              <td className="text-right">24,50</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-4 text-[10px]">26-09-2026 · 12:41</div>
      </div>
    </Paper>
  );
}

/* Two more invoices for Home's "your Form" section: other suppliers, other
 * layouts, the same Fields. */

function WholesaleInvoicePage() {
  return (
    <Paper className="p-0">
      <div className="flex items-end justify-between bg-[#1E4D3A] px-7 pt-6 pb-4 text-white">
        <div>
          <b className="block text-[16px] tracking-wide">GROOTHANDEL BAKKER</b>
          <span className="text-[10px] opacity-80">Horeca &amp; kantoor · Zwolle</span>
        </div>
        <span className="text-[22px] font-light tracking-[0.2em]">FACTUUR</span>
      </div>
      <div className="grid grid-cols-2 gap-4 px-7 pt-5 pb-4 text-[11px]">
        <div>
          <span className={cn("block text-[10px]", faint)}>Factuur aan</span>
          Kantoor Noord B.V.
          <br />
          Stationsplein 2, Groningen
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-right">
          <dt className={faint}>Factuurnr.</dt>
          <dd>2026/1187</dd>
          <dt className={faint}>Datum</dt>
          <dd>1 oktober 2026</dd>
          <dt className={faint}>Klantnr.</dt>
          <dd>40213</dd>
        </dl>
      </div>
      <table className="mx-7 mb-3 w-[calc(100%-3.5rem)] border-collapse text-[11px] tabular-nums">
        <thead>
          <tr className="bg-[#EEF3F0] text-left">
            <th className="px-2 py-1 font-semibold">Aantal</th>
            <th className="px-2 py-1 font-semibold">Omschrijving</th>
            <th className="px-2 py-1 text-right font-semibold">Totaal</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["2.000", "Koffiebekers 250 ml", "180,00"],
            ["40", "Servetten wit, pak", "92,00"],
          ].map(([qty, item, total]) => (
            <tr key={item} className="border-b border-[#D9DDE3]">
              <td className="px-2 py-1">{qty}</td>
              <td className="px-2 py-1">{item}</td>
              <td className="px-2 py-1 text-right">{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mr-7 ml-auto grid w-44 grid-cols-[1fr_auto] gap-x-3 text-[11px] tabular-nums">
        <dt className={faint}>Netto</dt>
        <dd className="text-right">272,00</dd>
        <dt className={faint}>BTW 21%</dt>
        <dd className="text-right">57,12</dd>
        <dt className="font-bold">Te betalen</dt>
        <dd className="text-right font-bold">€ 329,12</dd>
      </dl>
      <Foot>NL02 RABO 0123 4567 89 · Betaling binnen 14 dagen</Foot>
    </Paper>
  );
}

function HandwrittenInvoicePage() {
  return (
    <Paper className={cn(scan, "bg-[#FBF7EC]")} style={{ transform: "rotate(-0.8deg)" }}>
      <Head name="Klusbedrijf Smit" lines={["Dorpsstraat 41, Haren", "06 4433 2211"]} />
      <div className="mb-3 flex items-center justify-between">
        <Title>NOTA</Title>
        <span className="flex items-end gap-1.5">
          <small className={faint}>Nr.</small>
          <span className="font-bold text-[#B91C1C]">0087</span>
        </span>
      </div>
      <Line label="Datum">
        <span className={cn(pen, "text-[20px]")}>29/9/26</span>
      </Line>
      <Line label="Voor">
        <span className={cn(pen, "text-[20px]")}>Kantoor Noord</span>
      </Line>
      <Line label="Werk">
        <span className={cn(pen, "flex-1 text-[19px]")}>Kraan vervangen</span>
        <span className={cn(pen, "text-[20px]")}>85,-</span>
      </Line>
      <Line label="Materiaal">
        <span className={cn(pen, "flex-1 text-[19px]")}>mengkraan + slangen</span>
        <span className={cn(pen, "text-[20px]")}>42,50</span>
      </Line>
      <Line label="Totaal excl. btw">
        <span className={cn(pen, "ml-auto text-[21px] font-semibold")}>127,50</span>
      </Line>
      <Foot>Graag binnen 8 dagen overmaken · NL17 INGB 0006 5432 10</Foot>
    </Paper>
  );
}

/** Home's three invoices, one Form: each a different supplier and layout. */
export const invoicePages = {
  hoekstra: InvoicePage,
  bakker: WholesaleInvoicePage,
  smit: HandwrittenInvoicePage,
} as const;

/** Each PDF demo Document's pages, in order. */
export const demoPages = {
  invoice: [InvoicePage],
  delivery: [DeliveryPage1, DeliveryPage2],
  service: [ServiceRequestPage],
  order: [OrderPage],
  receipt: [ReceiptPage],
} as const;

export type DemoPdfId = keyof typeof demoPages;

/*
 * The demo's photos, drawn as SVG so they scale with the image pane's zoom: a
 * crushed box (the complaint email's attachment) and a handwritten work order
 * on a table (a photo Document).
 */

function BoxPhoto({ alt }: { alt: string }) {
  return (
    <svg viewBox="0 0 400 300" role="img" aria-label={alt} className="block h-auto w-full">
      <rect width="400" height="300" fill="#8B8C8E" />
      <rect y="190" width="400" height="110" fill="#6E6F72" />
      <ellipse cx="205" cy="262" rx="150" ry="16" fill="#000" opacity=".25" />
      <path d="M95 130 L205 100 L320 130 L320 245 L205 270 L95 245 Z" fill="#C79A64" />
      <path d="M95 130 L205 160 L320 130 L205 100 Z" fill="#D8B07C" />
      <path d="M205 160 L205 270 L95 245 L95 130 Z" fill="#B88850" />
      <path d="M205 160 L320 130 L320 245 L205 270 Z" fill="#A87A44" />
      <path d="M296 128 L330 150 L318 190 L300 170 L306 150 Z" fill="#7A5528" />
      <path d="M300 170 L318 190 L312 205 L292 182 Z" fill="#5E3F1C" opacity=".8" />
      <rect x="130" y="188" width="46" height="26" fill="#F2F0EA" transform="rotate(8 153 201)" />
      <rect x="196" y="140" width="22" height="30" fill="#E8E1CF" opacity=".9" transform="skewY(-14)" />
    </svg>
  );
}

function WorkOrderPhoto({ alt }: { alt: string }) {
  return (
    <svg viewBox="0 0 400 300" role="img" aria-label={alt} className="block h-auto w-full">
      <rect width="400" height="300" fill="#7B6249" />
      <g transform="rotate(-3 200 150)">
        <rect x="55" y="22" width="290" height="258" fill="#FBF7EC" />
        <rect x="55" y="22" width="290" height="258" fill="none" stroke="#D9DDE3" />
        <text x="70" y="48" fontSize="13" fontWeight="700" fill="#1D2433">
          WERKBON
        </text>
        <text x="332" y="48" fontSize="12" fontWeight="700" textAnchor="end" fill="#B91C1C">
          0212
        </text>
        <line x1="70" y1="56" x2="330" y2="56" stroke="#D9DDE3" />
        {[
          ["Klant", "Café Het Anker", 92],
          ["Datum", "30/9/26", 128],
          ["Werk", "Tap vervangen", 164],
          ["Uren", "2,5 u", 200],
          ["Materiaal", "mengkraan + slangen", 236],
        ].map(([label, value, y]) => (
          <g key={label}>
            <text x="70" y={Number(y)} fontSize="9" fill="#6B7280">
              {label}
            </text>
            <line x1="70" y1={Number(y) + 6} x2="330" y2={Number(y) + 6} stroke="#9CA3AF" strokeWidth=".6" />
            <text x="118" y={Number(y) + 2} fontSize="22" fill="#1F3A8A" className={hand.className}>
              {value}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** The photos of the demo's photo Documents and email attachments, by Document. */
export const demoPhotos = { complaint: BoxPhoto, workorder: WorkOrderPhoto } as const;

export type DemoPhotoId = keyof typeof demoPhotos;

/** The demo's Documents that are emails (drawn by the email pane, not here). */
export type DemoEmailId = "complaint" | "newsletter";

export type DemoDocumentId = DemoPdfId | DemoPhotoId | DemoEmailId;
