"use client";

import { useQuery } from "convex/react";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

// Until online billing exists, a Plan is arranged through the marketing
// site's Contact page: outside the app's root layout, so a full page load.
export const UPGRADE_URL = "/contact";

export function UpgradeButton({ size = "sm" }: { size?: "sm" | "default" }) {
  return (
    <Button size={size} nativeButton={false} render={<a href={UPGRADE_URL} />}>
      Upgrade
    </Button>
  );
}

export function formatResetDate(at: number) {
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The Pages left and when they reset, next to Upload. Nothing for internal unlimited. */
export function PagesLeft({ organisationSlug }: { organisationSlug: string }) {
  const usage = useQuery(api.pages.usage, { organisationSlug });
  if (!usage || usage.remaining === null) return null;
  return (
    <p className="text-sm text-muted-foreground tabular-nums">
      {usage.remaining} {usage.remaining === 1 ? "page" : "pages"} left
      {usage.resetsAt !== null && ` · resets ${formatResetDate(usage.resetsAt)}`}
    </p>
  );
}

/** For Admins: shown once 80% of the Organisation's Pages are used. */
export function PagesWarning({ organisationSlug }: { organisationSlug: string }) {
  const usage = useQuery(api.pages.usage, { organisationSlug });
  if (!usage?.warning || usage.remaining === null) return null;
  const out = usage.remaining === 0;
  return (
    <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <TriangleAlert />
      <AlertTitle>
        {out
          ? "Your Organisation has no pages left"
          : `Your Organisation has ${usage.remaining} ${usage.remaining === 1 ? "page" : "pages"} left`}
      </AlertTitle>
      <AlertDescription>
        {out
          ? "New PDFs are refused until you upgrade. Documents already uploaded keep working."
          : "You've used 80% of your pages. Upgrade in time so new PDFs aren't refused."}
        {usage.resetsAt !== null && ` Your pages reset on ${formatResetDate(usage.resetsAt)}.`}
      </AlertDescription>
      <AlertAction>
        <UpgradeButton />
      </AlertAction>
    </Alert>
  );
}
