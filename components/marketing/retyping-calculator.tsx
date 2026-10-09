"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { custom, formatEuro, formatNumber, plans } from "@/lib/plans";

/** Working days in a month, and Items per Submission, for the estimate. */
const WORKDAYS = 21;
const ITEMS_PER_SUBMISSION = 1;

/** The smallest Plan that fits the month, or Custom above the largest. */
function vinkCost(items: number) {
  const plan = plans.find((p) => p.items >= items);
  return plan ? { name: plan.name, monthly: plan.monthly, from: false } : { name: custom.name, monthly: custom.fromMonthly, from: true };
}

/** Home: the reader's own numbers for retyping by hand, next to the fitting Plan. */
export function RetypingCalculator() {
  const t = useTranslations("home.calculator");
  const locale = useLocale();
  const [documents, setDocuments] = useState(40);
  const [minutes, setMinutes] = useState(3);
  const [hourly, setHourly] = useState(35);

  const hours = Math.round((documents * minutes * WORKDAYS) / 60);
  const byHand = hours * hourly;
  const vink = vinkCost(documents * WORKDAYS * ITEMS_PER_SUBMISSION);
  const widest = Math.max(byHand, vink.monthly, 1);

  const inputs = [
    { key: "documents", value: documents, set: setDocuments, min: 5, max: 300, step: 5, shown: formatNumber(documents, locale) },
    { key: "minutes", value: minutes, set: setMinutes, min: 1, max: 15, step: 1, shown: t("minutesValue", { count: minutes }) },
    { key: "hourly", value: hourly, set: setHourly, min: 20, max: 80, step: 5, shown: formatEuro(hourly, locale) },
  ] as const;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl border lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col justify-center gap-7 p-6 sm:p-8">
        {inputs.map((input) => (
          <div key={input.key} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <label id={`calc-${input.key}`} className="text-[15px] font-medium">
                {t(`${input.key}Label`)}
              </label>
              <span className="font-mono text-sm tabular-nums">{input.shown}</span>
            </div>
            <Slider
              aria-labelledby={`calc-${input.key}`}
              value={input.value}
              min={input.min}
              max={input.max}
              step={input.step}
              onValueChange={(value) => input.set(Array.isArray(value) ? value[0] : value)}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-6 border-t bg-panel p-6 sm:p-8 lg:border-t-0 lg:border-l">
        <div>
          <p className="text-sm text-muted-foreground">{t("hoursLabel")}</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{t("hoursValue", { count: hours })}</p>
        </div>
        <dl className="flex flex-col gap-4" aria-live="polite">
          <Bar label={t("byHand")} amount={`${formatEuro(byHand, locale)}${t("perMonth")}`} share={byHand / widest} tone="bg-amber-400 dark:bg-amber-500" />
          <Bar
            label={t("withVink", { plan: vink.name })}
            amount={`${vink.from ? `${t("from")} ` : ""}${formatEuro(vink.monthly, locale)}${t("perMonth")}`}
            share={vink.monthly / widest}
            tone="bg-navy"
          />
        </dl>
        <p className="mt-auto text-[13px] text-muted-foreground">{t("note", { days: WORKDAYS })}</p>
      </div>
    </div>
  );
}

function Bar({ label, amount, share, tone }: { label: string; amount: string; share: number; tone: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4 text-[15px]">
        <dt className="font-medium">{label}</dt>
        <dd className="font-semibold tabular-nums">{amount}</dd>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={`h-full rounded-full transition-[width] duration-300 ${tone}`} style={{ width: `${Math.max(share * 100, 1.5)}%` }} />
      </div>
    </div>
  );
}
