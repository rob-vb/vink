"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

/**
 * For Admins, on every page but Documents: while the setup is open, the way
 * back to it. (The setup itself shows on Documents; see documents/setup-guide.tsx.)
 */
export function SetupBar({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("appDocuments.setup");
  const pathname = usePathname();
  const base = `/app/o/${organisationSlug}`;
  const setup = useQuery(api.onboarding.state, { organisationSlug });
  if (pathname === base || !setup?.setup || setup.step === null) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted/40 px-4 py-2 text-sm md:px-6"
    >
      <span>{t("bar", { step: setup.step })}</span>
      <Button size="sm" nativeButton={false} render={<Link href={base} />}>
        {t("barAction")}
      </Button>
    </div>
  );
}
