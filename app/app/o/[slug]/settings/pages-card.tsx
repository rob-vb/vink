"use client";

import { useAction, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { formatResetDate } from "../pages-usage";
import { PlanDialog } from "./plan-dialog";

// Plan names are product names and stay as they are; only "Internal" is a word.
const planNames = {
  starter: "Starter",
  team: "Team",
  business: "Business",
  custom: "Custom",
} as const;

// Where Stripe sends the Admin back to (convex/billing.ts), and what to say.
const returns = {
  subscribed: "subscribed",
  "topped-up": "toppedUp",
} as const;

/** Opens a Stripe page (Checkout or the Customer Portal) from a Convex action. */
function useBillingRedirect() {
  const t = useTranslations("appSettings.billing");
  const [busy, setBusy] = useState<string | null>(null);
  async function go(what: string, url: () => Promise<string>) {
    setBusy(what);
    try {
      window.location.assign(await url());
    } catch {
      toast.error(t("failed"));
      setBusy(null);
    }
  }
  return { busy, go };
}

/** The Organisation's Plan and the Pages it has left, with what an Admin can buy. */
export function PagesCard({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("appSettings.pages");
  const tb = useTranslations("appSettings.billing");
  const locale = useLocale() as "nl" | "en";
  const usage = useQuery(api.pages.usage, { organisationSlug });
  const portal = useAction(api.billing.portal);
  const topUp = useAction(api.billing.topUp);
  const { busy, go } = useBillingRedirect();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // `?billing=…`: open the plan chooser, or say how a Stripe page went. Once.
  const outcome = searchParams.get("billing");
  const [choosing, setChoosing] = useState(outcome === "plans");
  useEffect(() => {
    if (outcome === null) return;
    if (outcome in returns) toast.success(tb(returns[outcome as keyof typeof returns]));
    router.replace(pathname, { scroll: false });
  }, [outcome, pathname, router, tb]);

  if (usage === undefined) return <Skeleton className="h-36" />;
  const plan =
    usage.plan === null
      ? t("noPlan")
      : usage.plan === "internal_unlimited"
        ? t("internal")
        : planNames[usage.plan];
  const canTopUp = usage.plan !== null && !usage.unlimited;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        {!usage.unlimited && (
          <CardAction className="flex flex-wrap justify-end gap-2">
            {canTopUp && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => go("topUp", () => topUp({ organisationSlug, locale }))}
              >
                {busy === "topUp" && <Spinner />}
                {tb("topUp")}
              </Button>
            )}
            {usage.hasBillingCustomer && (
              <Button
                size="sm"
                variant={usage.subscription ? "default" : "outline"}
                disabled={busy !== null}
                onClick={() => go("portal", () => portal({ organisationSlug, locale }))}
              >
                {busy === "portal" && <Spinner />}
                {usage.subscription ? tb("manage") : tb("invoices")}
              </Button>
            )}
            {usage.plan === null && (
              <Button size="sm" onClick={() => setChoosing(true)}>
                {tb("choosePlan")}
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
          <dt className="text-muted-foreground">{t("plan")}</dt>
          <dd>
            {plan}
            {usage.subscription &&
              ` · ${usage.subscription.interval === "annual" ? tb("annual") : tb("monthly")}`}
          </dd>
          {usage.subscription?.endsAt != null && (
            <>
              <dt className="text-muted-foreground">{tb("cancelled")}</dt>
              <dd>{tb("endsOn", { date: formatResetDate(usage.subscription.endsAt, locale) })}</dd>
            </>
          )}
          {usage.remaining !== null && (
            <>
              <dt className="text-muted-foreground">{t("left")}</dt>
              <dd className="tabular-nums">{usage.remaining}</dd>
            </>
          )}
          {usage.plan !== null && !usage.unlimited && (
            <>
              <dt className="text-muted-foreground">{t("period")}</dt>
              <dd className="tabular-nums">
                {t("periodLeft", { left: usage.allowanceLeft, allowance: usage.allowance })}
                {usage.topUpPages > 0 && t("topUp", { pages: usage.topUpPages })}
              </dd>
            </>
          )}
          {usage.freePages > 0 && (
            <>
              <dt className="text-muted-foreground">{t("free")}</dt>
              <dd className="tabular-nums">{usage.freePages}</dd>
            </>
          )}
          {usage.resetsAt !== null && (
            <>
              <dt className="text-muted-foreground">{t("resets")}</dt>
              <dd>{t("resetsOn", { date: formatResetDate(usage.resetsAt, locale) })}</dd>
            </>
          )}
        </dl>
        {usage.plan === null && usage.freePages === 0 && usage.remaining === 0 && (
          <p className="text-muted-foreground">{t("noneFree")}</p>
        )}
      </CardContent>
      <PlanDialog
        organisationSlug={organisationSlug}
        open={choosing && usage.plan === null}
        onOpenChange={setChoosing}
      />
    </Card>
  );
}
