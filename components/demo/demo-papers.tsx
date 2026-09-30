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

/** Each demo Document's pages, in order. */
export const demoPages = {
  invoice: [InvoicePage],
  delivery: [DeliveryPage1, DeliveryPage2],
  service: [ServiceRequestPage],
  order: [OrderPage],
  receipt: [ReceiptPage],
} as const;

export type DemoDocumentId = keyof typeof demoPages;
