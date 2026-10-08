"use client";

import { useQuery } from "convex/react";
import { TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

/** For Admins: to the Plans on the Settings page, which opens the plan chooser. */
export function UpgradeButton({
  organisationSlug,
  size = "sm",
}: {
  organisationSlug: string;
  size?: "sm" | "default";
}) {
  const t = useTranslations("app.items");
  return (
    <Button
      size={size}
      nativeButton={false}
      render={<Link href={`/app/o/${organisationSlug}/settings?billing=plans`} />}
    >
      {t("upgrade")}
    </Button>
  );
}

export function formatResetDate(at: number, locale = "en") {
  return new Date(at).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** The Items left and when they reset, next to Upload. Nothing for internal unlimited. */
export function ItemsLeft({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("app.items");
  const locale = useLocale();
  const usage = useQuery(api.items.usage, { organisationSlug });
  if (!usage || usage.remaining === null) return null;
  return (
    <p className="text-sm text-muted-foreground tabular-nums">
      {t("left", { remaining: usage.remaining })}
      {usage.resetsAt !== null && t("resets", { date: formatResetDate(usage.resetsAt, locale) })}
    </p>
  );
}

/** For Admins: shown once 80% of the Organisation's Items are used. */
export function ItemsWarning({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("app.items");
  const locale = useLocale();
  const usage = useQuery(api.items.usage, { organisationSlug });
  if (!usage?.warning || usage.remaining === null) return null;
  const out = usage.remaining === 0;
  return (
    <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <TriangleAlert />
      <AlertTitle>
        {out ? t("noneLeftTitle") : t("leftTitle", { remaining: usage.remaining })}
      </AlertTitle>
      <AlertDescription>
        {out ? t("noneLeft") : t("almostOut")}
        {usage.resetsAt !== null && t("resetsOn", { date: formatResetDate(usage.resetsAt, locale) })}
      </AlertDescription>
      <AlertAction>
        <UpgradeButton organisationSlug={organisationSlug} />
      </AlertAction>
    </Alert>
  );
}
