"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";

/**
 * Makes the new user Admin of their Organisation, then opens it. Without the
 * name from sign-up (a link that lost it, or a sign-up from the sign-in page),
 * it asks for the name first instead of making up one.
 */
export function FinishSignUp({ organisation }: { organisation: string }) {
  const t = useTranslations("app.welcome");
  const ta = useTranslations("app.auth.signUp");
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const createOrganisation = useMutation(api.onboarding.createOrganisation);
  const started = useRef(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const create = useCallback(
    (organisationName: string) => {
      if (started.current) return;
      started.current = true;
      setCreating(true);
      void createOrganisation({ name: organisationName }).then(({ slug }) => router.replace(`/app/o/${slug}`));
    },
    [createOrganisation, router],
  );

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/app/sign-in");
      return;
    }
    if (organisation !== "") create(organisation);
  }, [create, isAuthenticated, isLoading, organisation, router]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() !== "") create(name.trim());
  }

  if (organisation !== "" || creating || isLoading || !isAuthenticated) {
    return (
      <main className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        {t("settingUp")}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted p-4 md:p-10">
      <Logo className="h-8" />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("askTitle")}</CardTitle>
          <CardDescription>{t("askDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="organisation">{ta("organisationName")}</FieldLabel>
                <Input
                  id="organisation"
                  placeholder={ta("organisationPlaceholder")}
                  autoComplete="organization"
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field>
                <Button type="submit" disabled={name.trim() === ""}>
                  {t("askSubmit")}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
