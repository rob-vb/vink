"use client";

import { useQuery } from "convex/react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { formatResetDate, UpgradeButton } from "../pages-usage";

const planNames = {
  starter: "Starter",
  team: "Team",
  business: "Business",
  custom: "Custom",
  internal_unlimited: "Internal",
} as const;

/** The Organisation's Plan and the Pages it has left. */
export function PagesCard({ organisationSlug }: { organisationSlug: string }) {
  const usage = useQuery(api.pages.usage, { organisationSlug });
  if (usage === undefined) return <Skeleton className="h-36" />;
  const plan = usage.plan ? planNames[usage.plan] : "No Plan";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pages</CardTitle>
        <CardDescription>
          Every page of a PDF Vink reads counts once, when it&apos;s uploaded. Retries and moving a
          Document to another Form are free.
        </CardDescription>
        {!usage.unlimited && (
          <CardAction>
            <UpgradeButton />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
          <dt className="text-muted-foreground">Plan</dt>
          <dd>{plan}</dd>
          {usage.remaining !== null && (
            <>
              <dt className="text-muted-foreground">Pages left</dt>
              <dd className="tabular-nums">{usage.remaining}</dd>
            </>
          )}
          {usage.plan !== null && !usage.unlimited && (
            <>
              <dt className="text-muted-foreground">This period</dt>
              <dd className="tabular-nums">
                {usage.allowanceLeft} of {usage.allowance} left
                {usage.topUpPages > 0 && `, plus ${usage.topUpPages} Top-up pages`}
              </dd>
            </>
          )}
          {usage.freePages > 0 && (
            <>
              <dt className="text-muted-foreground">Free pages</dt>
              <dd className="tabular-nums">{usage.freePages}</dd>
            </>
          )}
          {usage.resetsAt !== null && (
            <>
              <dt className="text-muted-foreground">Resets</dt>
              <dd>{formatResetDate(usage.resetsAt)}. Unused pages don&apos;t roll over.</dd>
            </>
          )}
        </dl>
        {usage.plan === null && usage.freePages === 0 && usage.remaining === 0 && (
          <p className="text-muted-foreground">
            Free pages come once, with the first Organisation someone creates. This Organisation
            has none, so choose a Plan to upload PDFs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
