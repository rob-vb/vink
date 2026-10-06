"use client";

import { useAction } from "convex/react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorText } from "../../../error-text";

/**
 * Connects a spreadsheet Integration's account again: off to the provider's
 * consent page, back on the Integrations page (`?google=reconnected`, or
 * `?excel=reconnected`). The sheet or workbook stays the same.
 */
export function ReconnectButton({
  organisationSlug,
  integrationId,
  label,
  variant = "default",
}: {
  organisationSlug: string;
  integrationId: Id<"integrations">;
  label: string;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("appIntegrations");
  const errorText = useErrorText();
  const reconnectUrl = useAction(api.integrations.reconnectUrl);
  const [pending, setPending] = useState(false);

  async function reconnect() {
    setPending(true);
    try {
      // The page is left, so `pending` stays on.
      const { url } = await reconnectUrl({ organisationSlug, integrationId });
      window.location.assign(url);
    } catch (error) {
      toast.error(errorText(error, t("tryAgain")));
      setPending(false);
    }
  }

  return (
    <Button type="button" size="sm" variant={variant} disabled={pending} onClick={reconnect}>
      {pending ? <Spinner /> : <RefreshCw />}
      {label}
    </Button>
  );
}
