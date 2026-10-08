"use client";

import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { annualTotal, formatEuro, formatNumber, perItem, plans } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { StartFreeLink } from "./cta-links";

type Billing = "monthly" | "annual";

/** The Monthly / Annual toggle and the three plan cards. Monthly is shown first in the static HTML. */
export function PricingCards() {
  const t = useTranslations("pricing");
  const locale = useLocale();
  const [billing, setBilling] = useState<Billing>("monthly");
  return (
    <div className="flex flex-col items-center gap-10">
      <ToggleGroup
        aria-label={t("billing.label")}
        variant="outline"
        value={[billing]}
        onValueChange={(value) => value[0] && setBilling(value[0] as Billing)}
        className="rounded-lg bg-card"
      >
        <ToggleGroupItem value="monthly" className="h-9 px-4">
          {t("billing.monthly")}
        </ToggleGroupItem>
        <ToggleGroupItem value="annual" className="h-9 gap-2 px-4">
          {t("billing.annual")}
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
            {t("billing.discount")}
          </Badge>
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="grid w-full gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = billing === "annual" ? plan.annualMonthly : plan.monthly;
          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-7",
                plan.highlighted && "border-foreground/80 shadow-[0_12px_40px_-20px_rgba(15,30,54,0.45)] ring-1 ring-foreground/80",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                {plan.highlighted && <Badge>{t("card.popular")}</Badge>}
              </div>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground">{t(`plans.${plan.id}`)}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="text-5xl font-semibold tracking-tight tabular-nums">{formatEuro(price, locale)}</span>
                <span className="text-sm text-muted-foreground">{t("card.perMonth")}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {billing === "annual"
                  ? t("card.billedAnnually", { total: formatEuro(annualTotal(plan), locale) })
                  : t("card.billedMonthly")}
                {" · "}
                {t("card.vat")}
              </p>
              <p className="mt-5 inline-flex items-center gap-2 self-start rounded-full border bg-muted px-3 py-1 font-mono text-sm">
                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                {t("card.pages", { count: formatNumber(plan.items, locale) })}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("card.perPage", { price: formatEuro(perItem(plan, billing), locale, 3) })}
              </p>
              <StartFreeLink
                location={`pricing-${plan.id}`}
                className={buttonVariants({
                  variant: plan.highlighted ? "default" : "outline",
                  size: "lg",
                  className: cn("mt-7 h-10 w-full", !plan.highlighted && "!border-foreground/25"),
                })}
              >
                {t("card.cta")}
              </StartFreeLink>
            </div>
          );
        })}
      </div>
    </div>
  );
}
