"use client";

import { useAction } from "convex/react";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import { routing } from "@/i18n/routing";
import { annualTotal, formatEuro, formatNumber, plans, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

type Billing = "monthly" | "annual";

// The marketing site's Contact page, in the app's language: outside the app's
// root layout, so a full page load.
function contactUrl(locale: string) {
  return locale === routing.defaultLocale ? "/contact" : `/${locale}/contact`;
}

/** The three Plans as on the Pricing page; choosing one goes to Stripe Checkout. */
export function PlanDialog({
  organisationSlug,
  open,
  onOpenChange,
}: {
  organisationSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("appSettings.billing");
  const locale = useLocale() as "nl" | "en";
  const checkout = useAction(api.billing.checkout);
  const [billing, setBilling] = useState<Billing>("monthly");
  const [choosing, setChoosing] = useState<PlanId | null>(null);

  async function choose(plan: PlanId) {
    setChoosing(plan);
    try {
      window.location.assign(await checkout({ organisationSlug, plan, interval: billing, locale }));
    } catch {
      toast.error(t("failed"));
      setChoosing(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("chooseTitle")}</DialogTitle>
          <DialogDescription>{t("chooseDescription")}</DialogDescription>
        </DialogHeader>
        <ToggleGroup
          aria-label={t("interval")}
          variant="outline"
          value={[billing]}
          onValueChange={(value) => value[0] && setBilling(value[0] as Billing)}
          className="self-center"
        >
          <ToggleGroupItem value="monthly" className="px-4">
            {t("monthly")}
          </ToggleGroupItem>
          <ToggleGroupItem value="annual" className="gap-2 px-4">
            {t("annual")}
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
              −20%
            </Badge>
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-xl border p-4",
                plan.highlighted && "border-foreground/80 ring-1 ring-foreground/80",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{plan.name}</h3>
                {plan.highlighted && <Badge>{t("popular")}</Badge>}
              </div>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatEuro(billing === "annual" ? plan.annualMonthly : plan.monthly, locale)}
                </span>
                <span className="text-sm text-muted-foreground">{t("perMonth")}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {billing === "annual"
                  ? t("billedAnnually", { total: formatEuro(annualTotal(plan), locale) })
                  : t("billedMonthly")}
              </p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm">
                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                {t("pages", { count: formatNumber(plan.pages, locale) })}
              </p>
              <Button
                className="mt-4"
                variant={plan.highlighted ? "default" : "outline"}
                disabled={choosing !== null}
                onClick={() => choose(plan.id)}
              >
                {choosing === plan.id && <Spinner />}
                {t("choose", { plan: plan.name })}
              </Button>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {t.rich("custom", {
            contact: (chunks) => (
              <a className="underline underline-offset-4" href={contactUrl(locale)}>
                {chunks}
              </a>
            ),
          })}
        </p>
      </DialogContent>
    </Dialog>
  );
}
