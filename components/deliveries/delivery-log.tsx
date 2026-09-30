"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DeliveryView } from "./delivery-row";

export { DeliveryRow, DeliveryState, type DeliveryView } from "./delivery-row";

/** "Send again" for a failed Delivery: Admin only, same deliveryId, current configuration. */
export function ResendButton({
  organisationSlug,
  delivery,
}: {
  organisationSlug: string;
  delivery: DeliveryView;
}) {
  const resend = useMutation(api.deliveries.resend);
  if (!delivery.canResend) return null;
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() =>
        resend({ organisationSlug, id: delivery.id as Id<"deliveries"> }).catch((error) =>
          toast.error(error instanceof ConvexError ? String(error.data) : "That didn't work. Try again."),
        )
      }
    >
      <RotateCcw />
      Send again
    </Button>
  );
}
