"use client";

import { useQuery } from "convex/react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

/**
 * The link a company's IT admin opens to approve Vink for everyone in the
 * company (Microsoft's admin consent, convex/excel.ts), with a copy button.
 */
export function AdminConsentLink({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("appIntegrations.dialog");
  const consent = useQuery(api.excel.adminConsentUrl, { organisationSlug });
  if (consent === undefined) return null;
  if (consent.url === null) return <p className="text-muted-foreground">{t("adminLinkMissing")}</p>;
  const url = consent.url;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <code className="min-w-0 rounded bg-muted px-2 py-1 font-mono text-xs break-all">{url}</code>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => navigator.clipboard.writeText(url).then(() => toast.success(t("copied")))}
      >
        <Copy />
        {t("copyLink")}
      </Button>
    </div>
  );
}
