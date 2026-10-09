"use client";

import { useMutation } from "convex/react";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorText } from "@/app/app/error-text";
import type { DeliveryView } from "./delivery-row";

export { DeliveryRow, DeliveryState, type DeliveryView } from "./delivery-row";

/**
 * "Send again" for a failed Delivery: Admin only, same deliveryId, current
 * configuration. App only (the demo has no such button), so its words come
 * from the app's messages.
 */
export function ResendButton({
  organisationSlug,
  delivery,
}: {
  organisationSlug: string;
  delivery: DeliveryView;
}) {
  const t = useTranslations("appSubmissions");
  const errorText = useErrorText();
  const resend = useMutation(api.deliveries.resend);
  if (!delivery.canResend) return null;
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() =>
        resend({ organisationSlug, id: delivery.id as Id<"deliveries"> }).catch((error) =>
          toast.error(errorText(error, t("tryAgain"))),
        )
      }
    >
      <RotateCcw />
      {t("delivery.sendAgain")}
    </Button>
  );
}
