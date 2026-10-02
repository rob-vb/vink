"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { formatResetDate, UpgradeButton } from "../pages-usage";

// Plan names are product names and stay as they are; only "Internal" is a word.
const planNames = {
  starter: "Starter",
  team: "Team",
  business: "Business",
  custom: "Custom",
} as const;

/** The Organisation's Plan and the Pages it has left. */
export function PagesCard({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("appSettings.pages");
  const locale = useLocale();
  const usage = useQuery(api.pages.usage, { organisationSlug });
  if (usage === undefined) return <Skeleton className="h-36" />;
  const plan =
    usage.plan === null
      ? t("noPlan")
      : usage.plan === "internal_unlimited"
        ? t("internal")
        : planNames[usage.plan];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        {!usage.unlimited && (
          <CardAction>
            <UpgradeButton />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
          <dt className="text-muted-foreground">{t("plan")}</dt>
          <dd>{plan}</dd>
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
    </Card>
  );
}
