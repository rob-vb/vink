"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { CheckInbox } from "@/components/check-inbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

type Pending = "password" | "link" | null;

export function SignInForm({
  linkFailed,
  next,
}: {
  linkFailed: boolean;
  /** Where to go after signing in: an invite link, or home. */
  next: string | null;
}) {
  const t = useTranslations("app.auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  async function sendLink() {
    setPending("link");
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: next ?? "/app",
      newUserCallbackURL: next ?? "/app/welcome",
      errorCallbackURL: "/app/sign-in?error=link",
    });
    setPending(null);
    if (error) {
      setError(
        error.status === 429 && error.message?.startsWith("Too many requests")
          ? t("tooManyAttempts")
          : (error.message ?? t("linkNotSent")),
      );
      return;
    }
    setLinkSentTo(email);
  }

  async function signInWithPassword() {
    if (!password) {
      setError(t("signIn.enterPassword"));
      return;
    }
    setPending("password");
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setPending(null);
      if (error.code === "EMAIL_NOT_VERIFIED") {
        // Better Auth has just mailed a fresh verification link.
        setError(t("signIn.verifyFirst"));
      } else if (error.status === 429) {
        setError(t("tooManyAttempts"));
      } else {
        setError(t("signIn.noMatch"));
      }
      return;
    }
    router.push(next ?? "/app");
    router.refresh();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter?.getAttribute("value") === "link") {
      void sendLink();
    } else {
      void signInWithPassword();
    }
  }

  if (linkSentTo) {
    return (
      <CheckInbox
        email={linkSentTo}
        resending={pending === "link"}
        onResend={() => void sendLink()}
        onChangeEmail={() => setLinkSentTo(null)}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("signIn.title")}</CardTitle>
        <CardDescription>{t("signIn.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            {linkFailed && (
              <Alert variant="destructive">
                <AlertDescription>{t("signIn.linkFailed")}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor="email">{t("workEmail")}</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Field>
              <Button type="submit" value="password" disabled={pending !== null}>
                {pending === "password" && <Spinner />}
                {t("signIn.submit")}
              </Button>
            </Field>
            <FieldSeparator>{t("signIn.or")}</FieldSeparator>
            <Field>
              <Button
                type="submit"
                value="link"
                variant="outline"
                disabled={pending !== null}
              >
                {pending === "link" && <Spinner />}
                {t("signIn.emailLink")}
              </Button>
              <FieldDescription className="text-center">
                {t("signIn.newToVink")}{" "}
                {next ? (
                  <Link href={`/app/sign-up?${new URLSearchParams({ next })}`}>
                    {t("signIn.createAccount")}
                  </Link>
                ) : (
                  <Link href="/app/sign-up">{t("signIn.createOrganisation")}</Link>
                )}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
