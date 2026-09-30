"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { MailWarning, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

const roleNames = { admin: "Admin", member: "Member" } as const;

export function AcceptInvitation({ token }: { token: string }) {
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
      setError(
        error instanceof ConvexError ? String(error.data) : "We couldn't accept the invitation.",
      );
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
      Open Vink
    </Button>
  );

  switch (invitation.status) {
    case "notFound":
      return (
        <Problem title="This invitation doesn't exist" actions={home}>
          The link may be incomplete, or the invitation was withdrawn or replaced by a newer one.
          Ask an Admin to invite you again.
        </Problem>
      );
    case "used":
      return (
        <Problem title="This invitation was already used" actions={home}>
          It was accepted before, so it can&apos;t be used again.
        </Problem>
      );
    case "expired":
      return (
        <Problem title="This invitation has expired" actions={home}>
          Invitations work for 7 days. Ask an Admin of {invitation.organisationName} for a new one.
        </Problem>
      );
    case "anotherEmail":
      return (
        <Problem
          title="This invitation is for another address"
          actions={
            <Button onClick={() => void switchAccount()}>Sign in as {invitation.email}</Button>
          }
        >
          It was sent to <strong className="text-foreground">{invitation.email}</strong>, but
          you&apos;re signed in as{" "}
          <strong className="text-foreground">{session?.user.email ?? "someone else"}</strong>.
        </Problem>
      );
    case "open":
      return (
        <Card>
          <CardHeader className="text-center">
            <Users className="mx-auto mb-2 size-8 text-muted-foreground" />
            <CardTitle className="text-xl">Join {invitation.organisationName}</CardTitle>
            <CardDescription>
              {invitation.invitedBy ?? "An Admin"} invited you as {roleNames[invitation.role]}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {error && <FieldError>{error}</FieldError>}
            <Button onClick={() => void onAccept()} disabled={accepting}>
              {accepting && <Spinner />}
              Accept invitation
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Signed in as {invitation.email}
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
