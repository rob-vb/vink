"use client";

import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function CheckInbox({
  email,
  onResend,
  onChangeEmail,
  resending,
  purpose = "sign-in",
}: {
  email: string;
  onResend: () => void;
  onChangeEmail: () => void;
  resending: boolean;
  /** A sign-in link (5 minutes), or the link that verifies a password sign-up (1 hour). */
  purpose?: "sign-in" | "verify";
}) {
  return (
    <Card>
      <CardHeader className="text-center">
        <MailCheck className="mx-auto mb-2 size-8 text-muted-foreground" />
        <CardTitle className="text-xl">Check your email</CardTitle>
        <CardDescription>
          We sent a link to <span className="font-medium text-foreground">{email}</span>.{" "}
          {purpose === "verify"
            ? "Open it to verify your email and finish creating your account. It expires in 1 hour."
            : "Open it on this device to continue. It expires in 5 minutes."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button variant="outline" onClick={onResend} disabled={resending}>
          Send it again
        </Button>
        <Button variant="ghost" onClick={onChangeEmail}>
          Use a different email
        </Button>
      </CardContent>
    </Card>
  );
}
