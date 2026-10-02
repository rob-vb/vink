"use client";

import { useQuery } from "convex/react";
import { TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { routing } from "@/i18n/routing";

// Until online billing exists, a Plan is arranged through the marketing
// site's Contact page, in the app's language: outside the app's root layout,
// so a full page load.
function upgradeUrl(locale: string) {
  return locale === routing.defaultLocale ? "/contact" : `/${locale}/contact`;
}

export function UpgradeButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const t = useTranslations("app.pages");
  const locale = useLocale();
  return (
    <Button size={size} nativeButton={false} render={<a href={upgradeUrl(locale)} />}>
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

/** The Pages left and when they reset, next to Upload. Nothing for internal unlimited. */
export function PagesLeft({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("app.pages");
  const locale = useLocale();
  const usage = useQuery(api.pages.usage, { organisationSlug });
  if (!usage || usage.remaining === null) return null;
  return (
    <p className="text-sm text-muted-foreground tabular-nums">
      {t("left", { remaining: usage.remaining })}
      {usage.resetsAt !== null && t("resets", { date: formatResetDate(usage.resetsAt, locale) })}
    </p>
  );
}

/** For Admins: shown once 80% of the Organisation's Pages are used. */
export function PagesWarning({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("app.pages");
  const locale = useLocale();
  const usage = useQuery(api.pages.usage, { organisationSlug });
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
        <UpgradeButton />
      </AlertAction>
    </Alert>
  );
}
