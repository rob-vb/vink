"use client";

import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("app.auth.checkInbox");
  return (
    <Card>
      <CardHeader className="text-center">
        <MailCheck className="mx-auto mb-2 size-8 text-muted-foreground" />
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>
          {t.rich("sent", {
            email,
            b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}{" "}
          {purpose === "verify" ? t("verify") : t("signIn")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button variant="outline" onClick={onResend} disabled={resending}>
          {t("resend")}
        </Button>
        <Button variant="ghost" onClick={onChangeEmail}>
          {t("changeEmail")}
        </Button>
      </CardContent>
    </Card>
  );
}
