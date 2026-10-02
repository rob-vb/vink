"use client";

import { useMutation, useQuery } from "convex/react";
import { MailWarning, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { useErrorText } from "../../../error-text";

export function AcceptInvitation({ token }: { token: string }) {
  const t = useTranslations("app.auth.invite");
  const tRoles = useTranslations("app.roles");
  const errorText = useErrorText();
  const router = useRouter();
  const invitation = useQuery(api.invitations.preview, { token });
  const accept = useMutation(api.invitations.accept);
  const { data: session } = authClient.useSession();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAccept() {
    setAccepting(true);
    setError(null);
    try {
      const { slug } = await accept({ token });
      router.replace(`/app/o/${slug}`);
    } catch (error) {
      setAccepting(false);
      setError(errorText(error, t("notAccepted")));
    }
  }

  async function switchAccount() {
    await authClient.signOut();
    router.push(`/app/sign-in?${new URLSearchParams({ next: `/app/invite/${token}` })}`);
  }

  if (invitation === undefined) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-6" />
          <Skeleton className="h-4" />
          <Skeleton className="h-9" />
        </CardContent>
      </Card>
    );
  }

  const home = (
    <Button variant="outline" nativeButton={false} render={<Link href="/app" />}>
      {t("openVink")}
    </Button>
  );

  switch (invitation.status) {
    case "notFound":
      return (
        <Problem title={t("notFoundTitle")} actions={home}>
          {t("notFound")}
        </Problem>
      );
    case "used":
      return (
        <Problem title={t("usedTitle")} actions={home}>
          {t("used")}
        </Problem>
      );
    case "expired":
      return (
        <Problem title={t("expiredTitle")} actions={home}>
          {t("expired", { organisation: invitation.organisationName })}
        </Problem>
      );
    case "anotherEmail":
      return (
        <Problem
          title={t("anotherEmailTitle")}
          actions={
            <Button onClick={() => void switchAccount()}>
              {t("signInAs", { email: invitation.email })}
            </Button>
          }
        >
          {t.rich("anotherEmail", {
            email: invitation.email,
            current: session?.user.email ?? t("someoneElse"),
            strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
          })}
        </Problem>
      );
    case "open":
      return (
        <Card>
          <CardHeader className="text-center">
            <Users className="mx-auto mb-2 size-8 text-muted-foreground" />
            <CardTitle className="text-xl">
              {t("join", { organisation: invitation.organisationName })}
            </CardTitle>
            <CardDescription>
              {t("invitedBy", {
                inviter: invitation.invitedBy ?? t("anAdmin"),
                role: tRoles(invitation.role),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {error && <FieldError>{error}</FieldError>}
            <Button onClick={() => void onAccept()} disabled={accepting}>
              {accepting && <Spinner />}
              {t("accept")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t("signedInAs", { email: invitation.email })}
            </p>
          </CardContent>
        </Card>
      );
  }
}

function Problem({
  title,
  actions,
  children,
}: {
  title: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="text-center">
        <MailWarning className="mx-auto mb-2 size-8 text-muted-foreground" />
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">{actions}</CardContent>
    </Card>
  );
}
