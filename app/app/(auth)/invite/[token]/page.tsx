import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAuthenticated } from "@/lib/auth-server";
import { AcceptInvitation } from "./accept-invitation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.titles");
  return { title: t("invitation") };
}

export default async function InvitePage({ params }: PageProps<"/app/invite/[token]">) {
  const { token } = await params;
  if (await isAuthenticated()) {
    return <AcceptInvitation token={token} />;
  }

  const t = await getTranslations("app.auth.invite");
  const next = new URLSearchParams({ next: `/app/invite/${token}` });
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button nativeButton={false} render={<Link href={`/app/sign-in?${next}`} />}>
          {t("signIn")}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={`/app/sign-up?${next}`} />}>
          {t("createAccount")}
        </Button>
      </CardContent>
    </Card>
  );
}
