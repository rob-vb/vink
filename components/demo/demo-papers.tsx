import { Caveat } from "next/font/google";
import type { ReactNode } from "react";
import { cn } from "cn";
import { CLAIM_ITEMS } from "./demo-data";

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

/** The damage claim email's PDF: a form the customer filled in on a computer, so typed and sharp. */
function ClaimFormPage() {
  const box = (ticked: boolean) => (ticked ? "☒" : "☐");
  return (
    <Paper className="p-0 text-[10.5px] leading-[1.4]">
      <div className="flex items-end justify-between bg-[#1F4E79] px-6 pt-4 pb-3 text-white">
        <div>
          <b className="block text-[14px] tracking-wide">Assurantiekantoor De Meerkoet</b>
          <span className="text-[9.5px] opacity-80">Stationsweg 8, Amersfoort · schade@demeerkoet.nl</span>
        </div>
        <span className="text-[9.5px] opacity-80">Formulier SW-3</span>
      </div>
      <div className="px-6 pt-3">
        <div className="mb-2 text-[13px] font-bold">Schademeldingsformulier woonhuis/inboedel</div>
        <ClaimSection title="1. Verzekerde">
          <Facts
            rows={[
              ["Polisnummer", "WH-2048-7731"],
              ["Naam verzekerde", "Marieke Bosman"],
              ["Risicoadres", "Klaprooslaan 14, 3824 XK Amersfoort"],
              ["IBAN", "NL91 ABNA 0417 1643 00"],
            ]}
          />
        </ClaimSection>
        <ClaimSection title="2. De schade">
          <Facts
            rows={[
              ["Schadedatum", "27-09-2026"],
              [
                "Oorzaak",
                <span key="cause" className="flex flex-wrap gap-x-3">
                  {["Lekkage leiding", "Wasmachine of vaatwasser", "Neerslag", "Overig"].map((option) => (
                    <span key={option}>
                      {box(false)} {option}
                    </span>
                  ))}
                </span>,
              ],
              [
                "Toelichting",
                "Zaterdagochtend stond er water onder het aanrecht en in de woonkamer. Het water kwam onder de keukenkast vandaan, mogelijk de afvoer van de vaatwasser.",
              ],
            ]}
          />
        </ClaimSection>
        <ClaimSection title="3. Beschadigde zaken">
          <table className="mb-1 w-full border-collapse tabular-nums">
            <thead>
              <tr className="bg-[#EEF3F8] text-left">
                <th className="px-1.5 py-0.5 font-semibold">Omschrijving</th>
                <th className="px-1.5 py-0.5 font-semibold">Aanschafjaar</th>
                <th className="px-1.5 py-0.5 text-right font-semibold">Aanschafwaarde</th>
                <th className="px-1.5 py-0.5 text-right font-semibold">Geclaimd</th>
              </tr>
            </thead>
            <tbody>
              {CLAIM_ITEMS.map(([description, year, value, claimed]) => (
                <tr key={description} className="border-b border-[#D9DDE3]">
                  <td className="px-1.5 py-0.5">{description}</td>
                  <td className="px-1.5 py-0.5">{year}</td>
                  <td className="px-1.5 py-0.5 text-right">{value}</td>
                  <td className="px-1.5 py-0.5 text-right">{claimed}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="px-1.5 py-0.5 text-right font-bold">
                  Totaal geclaimd
                </td>
                <td className="px-1.5 py-0.5 text-right font-bold">1.685,00</td>
              </tr>
            </tbody>
          </table>
        </ClaimSection>
        <ClaimSection title="4. Ondertekening">
          <Facts
            rows={[
              ["Foto's bijgevoegd", `${box(true)} Ja  ${box(false)} Nee`],
              ["Datum", "29-09-2026"],
              ["Handtekening", <i key="sign" className="text-[13px]">Marieke Bosman</i>],
            ]}
          />
        </ClaimSection>
      </div>
      <Foot>{"Stuur dit formulier met foto's naar schade@demeerkoet.nl · Pagina 1 van 1"}</Foot>
    </Paper>
  );
}

function ClaimSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1 border-b border-[#1F4E79] pb-0.5 text-[10px] font-bold tracking-[0.08em] text-[#1F4E79] uppercase">
        {title}
      </div>
      {children}
    </section>
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
          ["Phone", "050 311 2040"],
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
      <p className={cn(pen, "text-[19px]")}>New no. 050 311 2044</p>
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
  claim: [ClaimFormPage],
  service: [ServiceRequestPage],
  order: [OrderPage],
  receipt: [ReceiptPage],
} as const;

export type DemoPdfId = keyof typeof demoPages;

/*
 * The demo's photos, drawn as SVG so they scale with the image pane's zoom: a
 * leaking espresso machine (the complaint email's attachment), wet laminate and
 * a stained kitchen cabinet (the damage claim email's), and a handwritten work
 * order on a table (a photo Document).
 */

function MachinePhoto({ alt }: { alt: string }) {
  return (
    <svg viewBox="0 0 400 300" role="img" aria-label={alt} className="block h-auto w-full">
      <rect width="400" height="300" fill="#9A9B9D" />
      <rect y="205" width="400" height="95" fill="#6E6F72" />
      <rect y="200" width="400" height="8" fill="#85868A" />
      <ellipse cx="215" cy="262" rx="150" ry="22" fill="#3F6F8F" opacity=".55" />
      <ellipse cx="190" cy="258" rx="70" ry="9" fill="#9CC3DB" opacity=".5" />
      <ellipse cx="190" cy="220" rx="125" ry="9" fill="#000" opacity=".22" />
      <rect x="95" y="40" width="190" height="165" rx="10" fill="#8B1E1E" />
      <rect x="95" y="40" width="190" height="26" rx="10" fill="#B9BCC2" />
      <circle cx="140" cy="94" r="18" fill="#F2F0EA" />
      <path d="M140 94 L151 84" stroke="#2B2E33" strokeWidth="2.5" />
      <circle cx="225" cy="94" r="9" fill="#B9BCC2" />
      <circle cx="252" cy="94" r="9" fill="#B9BCC2" />
      <rect x="150" y="122" width="80" height="14" rx="3" fill="#B9BCC2" />
      <path d="M160 136 H220 L214 150 H166 Z" fill="#6B7078" />
      <rect x="222" y="143" width="62" height="9" rx="4" fill="#2B2E33" />
      <rect x="168" y="162" width="44" height="26" rx="4" fill="#F2F0EA" />
      <path d="M212 168 q14 1 12 12 q-2 6 -12 5" fill="none" stroke="#F2F0EA" strokeWidth="4" />
      <rect x="120" y="190" width="140" height="15" rx="3" fill="#2B2E33" />
      <path d="M130 195 H250 M130 200 H250" stroke="#6B7078" strokeWidth="1.5" strokeDasharray="6 4" />
      <path d="M285 80 H312 V176" fill="none" stroke="#B9BCC2" strokeWidth="5" strokeLinejoin="round" />
      <path d="M118 204 q-5 14 0 24 q5 -10 0 -24 Z" fill="#7DB4D6" />
      <path d="M250 204 q-4 11 0 18 q4 -7 0 -18 Z" fill="#7DB4D6" />
      <path d="M96 150 q-6 18 0 32 q6 -14 0 -32 Z" fill="#7DB4D6" opacity=".9" />
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
          ["Werk", "Kraan vervangen", 164],
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


function FloorPhoto({ alt }: { alt: string }) {
  // Laminate seen from above at an angle: planks narrow towards the wall, two seams swollen by water.
  const rows = [300, 248, 202, 162, 128, 99, 75];
  return (
    <svg viewBox="0 0 400 300" role="img" aria-label={alt} className="block h-auto w-full">
      <rect width="400" height="300" fill="#B08A5E" />
      <rect width="400" height="62" fill="#E7E2D8" />
      <rect y="52" width="400" height="14" fill="#F4F1EA" />
      <rect y="64" width="400" height="3" fill="#C9C1B2" />
      {rows.slice(0, -1).map((y, i) => (
        <g key={y}>
          <rect y={rows[i + 1]} width="400" height={y - rows[i + 1]} fill={i % 2 ? "#B9946A" : "#A98258"} />
          <path d={`M0 ${rows[i + 1]} H400`} stroke="#7A5A3A" strokeWidth={1 + (6 - i) * 0.15} />
          <path
            d={`M${(i * 97) % 300 + 40} ${rows[i + 1]} V${y}`}
            stroke="#7A5A3A"
            strokeWidth="1.2"
          />
          <path d={`M14 ${rows[i + 1] + (y - rows[i + 1]) * 0.45} q90 -3 180 1 t200 -1`} stroke="#8E6B46" strokeWidth=".8" fill="none" opacity=".6" />
        </g>
      ))}
      <ellipse cx="200" cy="215" rx="175" ry="48" fill="#3E5F75" opacity=".28" />
      <ellipse cx="170" cy="205" rx="80" ry="12" fill="#DCEAF2" opacity=".45" />
      <ellipse cx="270" cy="236" rx="40" ry="6" fill="#DCEAF2" opacity=".4" />
      {[162, 202].map((y) => (
        <g key={y}>
          <path d={`M20 ${y} q45 -9 90 -2 q50 -10 100 -1 q55 -9 110 0 q40 -6 70 1`} fill="none" stroke="#6B4A2A" strokeWidth="5" />
          <path d={`M20 ${y - 3} q45 -9 90 -2 q50 -10 100 -1 q55 -9 110 0 q40 -6 70 1`} fill="none" stroke="#D9B98C" strokeWidth="2" />
        </g>
      ))}
      <rect x="318" y="88" width="12" height="150" fill="#3B3B3B" />
      <rect x="312" y="232" width="24" height="7" rx="2" fill="#2A2A2A" />
    </svg>
  );
}

function CabinetPhoto({ alt }: { alt: string }) {
  // The lower part of a white kitchen base cabinet, its plinth swollen and stained by water.
  return (
    <svg viewBox="0 0 400 300" role="img" aria-label={alt} className="block h-auto w-full">
      <rect width="400" height="300" fill="#C9CBC7" />
      {[0, 80, 160, 240, 320].map((x) => (
        <rect key={x} x={x} y="236" width="80" height="64" fill="#BFC1BC" stroke="#A9ABA6" />
      ))}
      <rect x="30" y="0" width="340" height="206" fill="#F2F1EC" />
      <path d="M200 0 V206" stroke="#D3D2CC" strokeWidth="3" />
      <rect x="90" y="40" width="70" height="7" rx="3" fill="#8F9399" />
      <rect x="240" y="40" width="70" height="7" rx="3" fill="#8F9399" />
      <rect x="40" y="206" width="320" height="30" fill="#E6E4DD" />
      <path d="M40 222 q40 -10 80 2 q50 12 90 -2 q50 -12 90 4 q30 8 60 -2 V236 H40 Z" fill="#B49A72" />
      <path
        d="M70 206 q10 -40 40 -52 q30 -10 50 6 q30 -26 62 -10 q34 -14 56 12 q18 18 30 44 Z"
        fill="#9C8A6A"
        opacity=".55"
      />
      <path d="M95 206 q14 -30 46 -34 q34 -2 52 10 q26 -18 54 -6 q24 10 34 30 Z" fill="#7E6C4E" opacity=".5" />
      <path d="M40 236 q60 -6 120 2 q80 8 200 -2" stroke="#6E5A3C" strokeWidth="3" fill="none" />
      <path d="M120 236 l4 6 M190 238 l-3 7 M260 236 l5 6 M320 236 l-2 6" stroke="#6E5A3C" strokeWidth="2" />
      <ellipse cx="200" cy="262" rx="150" ry="14" fill="#3E5F75" opacity=".22" />
      <ellipse cx="170" cy="258" rx="60" ry="4" fill="#E8F1F6" opacity=".6" />
    </svg>
  );
}

/** The photos of the demo's photo Documents and email attachments. */
export const demoPhotos = {
  complaint: MachinePhoto,
  claimFloor: FloorPhoto,
  claimCabinet: CabinetPhoto,
  workorder: WorkOrderPhoto,
} as const;

export type DemoPhotoId = keyof typeof demoPhotos;

/** The demo's Documents that are emails (drawn by the email pane, not here). */
export type DemoEmailId = "complaint" | "claim" | "newsletter";

export type DemoDocumentId = DemoPdfId | DemoPhotoId | DemoEmailId;
