"use client";

import { ArrowRight, Asterisk, Calendar, Hash, Rows3, Type, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState, type ReactNode } from "react";
import { invoicePages } from "@/components/demo/demo-papers";
import { ScaledStill } from "@/components/features/scaled-still";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { PostBar } from "./code-block";

/*
 * Home's "your Form" section: one Form, three invoices from three suppliers,
 * one Payload shape. Switching the invoice changes the paper and the values;
 * the Form and the keys stay the same.
 */

type Invoice = keyof typeof invoicePages;
const invoices = Object.keys(invoicePages) as Invoice[];

type FieldKey = "supplier" | "invoice_number" | "invoice_date" | "total_excl_vat" | "lines";

/** The Form, as the app's Form editor lists it: type icon, label, required. */
const formFields: Array<{ key: FieldKey; icon: LucideIcon; required?: boolean }> = [
  { key: "supplier", icon: Type, required: true },
  { key: "invoice_number", icon: Type, required: true },
  { key: "invoice_date", icon: Calendar },
  { key: "total_excl_vat", icon: Hash },
  { key: "lines", icon: Rows3 },
];

type Line = { item: string; amount: number };
type Data = { supplier: string; invoice_number: string; invoice_date: string; total_excl_vat: number; lines: Line[] };

/** What each paper says, in the Form's shape (dates ISO, amounts numbers). */
const data: Record<Invoice, Data> = {
  hoekstra: {
    supplier: "Drukkerij Hoekstra B.V.",
    invoice_number: "F-2026-0418",
    invoice_date: "2026-09-14",
    total_excl_vat: 1240,
    lines: [
      { item: "Flyers A5, 5,000", amount: 740 },
      { item: "Posters A2, 200", amount: 500 },
    ],
  },
  bakker: {
    supplier: "Groothandel Bakker",
    invoice_number: "2026/1187",
    invoice_date: "2026-10-01",
    total_excl_vat: 272,
    lines: [
      { item: "Koffiebekers 250 ml", amount: 180 },
      { item: "Servetten wit, pak", amount: 92 },
    ],
  },
  smit: {
    supplier: "Klusbedrijf Smit",
    invoice_number: "0087",
    invoice_date: "2026-09-29",
    total_excl_vat: 127.5,
    lines: [
      { item: "Kraan vervangen", amount: 85 },
      { item: "Mengkraan + slangen", amount: 42.5 },
    ],
  },
};

export function FormMatch() {
  const t = useTranslations("home.forms");
  const [invoice, setInvoice] = useState<Invoice>("hoekstra");
  const Paper = invoicePages[invoice];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium" id="form-match-pick">
          {t("pick")}
        </span>
        <ToggleGroup
          aria-labelledby="form-match-pick"
          variant="outline"
          value={[invoice]}
          onValueChange={(value) => value[0] && setInvoice(value[0] as Invoice)}
          className="flex-wrap rounded-lg bg-card"
        >
          {invoices.map((id) => (
            <ToggleGroupItem key={id} value={id} className="h-auto flex-col items-start gap-0 px-3 py-1.5 text-left">
              <span className="text-sm font-medium">{t(`invoices.${id}.name`)}</span>
              <span className="text-xs font-normal text-muted-foreground">{t(`invoices.${id}.kind`)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <ol className="grid grid-cols-[minmax(0,1fr)] rounded-2xl border bg-card lg:grid-cols-3 lg:grid-rows-[auto_1fr]">
        <Step n={1} title={t("steps.form.title")} body={t("steps.form.body")}>
          <FormCard />
        </Step>
        <Step n={2} title={t("steps.match.title")} body={t("steps.match.body")}>
          <div className="light-island rounded-xl bg-panel p-3">
            <ScaledStill
              width={460}
              always
              fade={false}
              label={t(`invoices.${invoice}.alt`)}
              className="mx-auto aspect-[1/1.414] max-w-[340px] bg-transparent"
            >
              <div className="p-2.5">
                <Paper />
              </div>
            </ScaledStill>
          </div>
        </Step>
        <Step n={3} title={t("steps.send.title")} body={t("steps.send.body")} last>
          <Payload invoice={invoice} />
          <p className="mt-3 text-sm text-muted-foreground">{t("sameKeys")}</p>
        </Step>
      </ol>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  last = false,
  children,
}: {
  n: number;
  title: string;
  body: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative flex min-w-0 flex-col gap-5 border-b p-6 last:border-b-0 sm:p-7 lg:row-span-2 lg:grid lg:grid-cols-[minmax(0,1fr)] lg:grid-rows-subgrid lg:border-r lg:border-b-0 lg:last:border-r-0">
      <div>
        <span className="grid size-7 place-items-center rounded-full border font-mono text-xs font-medium">{n}</span>
        <h3 className="mt-4 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-[15px] text-pretty text-muted-foreground">{body}</p>
      </div>
      <div>{children}</div>
      {!last && (
        <span
          aria-hidden
          className="absolute top-1/2 -right-3.5 z-10 hidden size-7 place-items-center rounded-full border bg-background text-muted-foreground lg:grid"
        >
          <ArrowRight className="size-3.5" />
        </span>
      )}
    </li>
  );
}

/** Mirrors the Form editor's Field list (app/app/o/[slug]/forms/form-editor.tsx, FieldRow). */
function FormCard() {
  const t = useTranslations("home.forms.form");
  return (
    <div className="light-island overflow-hidden rounded-xl border bg-background">
      <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <span className="font-medium">{t("name")}</span>
        <span className="text-xs text-muted-foreground">{t("count", { count: formFields.length })}</span>
      </div>
      <ul className="flex flex-col p-2">
        {formFields.map(({ key, icon: Icon, required }) => (
          <li key={key} className="flex flex-col">
            <span className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={t(`types.${key}`)} />
              <span className="min-w-0 flex-1 truncate">{t(`fields.${key}`)}</span>
              {required && <Asterisk className="size-3 shrink-0 text-destructive" aria-label={t("required")} />}
              <code className="font-mono text-[11px] text-muted-foreground">{key}</code>
            </span>
            {key === "lines" && (
              <span className="mr-2 ml-4 flex flex-col border-l pl-4 text-sm text-muted-foreground">
                {(["item", "amount"] as const).map((sub) => (
                  <span key={sub} className="flex items-center gap-2 py-1">
                    <span className="min-w-0 flex-1 truncate">{t(`fields.${sub}`)}</span>
                    <code className="font-mono text-[11px]">{sub}</code>
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const keyClass = "text-[#9cd2ff]";

/** The Payload's `data`, drawn by hand so the values can flash when they change. */
function Payload({ invoice }: { invoice: Invoice }) {
  const values = data[invoice];
  const value = (v: string | number) => (
    // A new key per invoice replays the fade, so the eye sees what changed.
    <span key={`${invoice}-${v}`} className={cn("animate-in fade-in duration-500", typeof v === "number" ? "text-[#b8e3a6]" : "text-[#f4d58d]")}>
      {typeof v === "number" ? v : JSON.stringify(v)}
    </span>
  );
  const pair = (indent: string, key: string, v: ReactNode, comma = true) => (
    <Fragment key={key}>
      {indent}
      <span className={keyClass}>&quot;{key}&quot;</span>: {v}
      {comma && ","}
      {"\n"}
    </Fragment>
  );
  return (
    <div className="overflow-hidden rounded-xl bg-code text-code-foreground">
      <div className="border-b border-white/10 px-4 py-2.5 font-mono text-xs">
        <PostBar url="https://your-app.example/vink" />
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[11.5px] leading-relaxed" tabIndex={0}>
        <code>
          {"{\n"}
          {pair("  ", "event", <span className="text-[#f4d58d]">&quot;submission.approved&quot;</span>)}
          <span className="text-[#7f8ea6]">{"  …\n"}</span>
          {"  "}
          <span className={keyClass}>&quot;data&quot;</span>
          {": {\n"}
          {pair("    ", "supplier", value(values.supplier))}
          {pair("    ", "invoice_number", value(values.invoice_number))}
          {pair("    ", "invoice_date", value(values.invoice_date))}
          {pair("    ", "total_excl_vat", value(values.total_excl_vat))}
          {"    "}
          <span className={keyClass}>&quot;lines&quot;</span>
          {": [\n"}
          {values.lines.map((line, i) => (
            <Fragment key={i}>
              {"      {\n"}
              {pair("        ", "item", value(line.item))}
              {pair("        ", "amount", value(line.amount), false)}
              {i < values.lines.length - 1 ? "      },\n" : "      }\n"}
            </Fragment>
          ))}
          {"    ]\n  }\n}"}
        </code>
      </pre>
    </div>
  );
}
