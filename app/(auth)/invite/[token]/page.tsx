import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAuthenticated } from "@/lib/auth-server";
import { AcceptInvitation } from "./accept-invitation";

export const metadata: Metadata = { title: "Invitation · Vink" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  if (await isAuthenticated()) {
    return <AcceptInvitation token={token} />;
  }

  const next = new URLSearchParams({ next: `/invite/${token}` });
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">You&apos;re invited to Vink</CardTitle>
        <CardDescription>
          Sign in or create an account with the address the invitation was sent to.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button nativeButton={false} render={<Link href={`/sign-in?${next}`} />}>
          Sign in
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href={`/sign-up?${next}`} />}>
          Create an account
        </Button>
      </CardContent>
    </Card>
  );
}
