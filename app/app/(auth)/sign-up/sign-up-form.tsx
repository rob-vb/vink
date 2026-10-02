"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { CheckInbox } from "@/components/check-inbox";
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
import { routing } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";

type Pending = "password" | "link" | null;

/** Better Auth's own answer to a per-IP limit is too technical; others are shown as they are. */
function messageOf(error: { status?: number; message?: string }, fallback: string, tooMany: string) {
  if (error.status === 429 && error.message?.startsWith("Too many requests")) {
    return tooMany;
  }
  return error.message ?? fallback;
}

/** A marketing page in the app's language: the default language has no prefix. */
function marketingPath(locale: string, path: string) {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

/**
 * Signs up and creates the user's own Organisation, or, when `next` is an
 * invite link, signs up only and returns there to join the inviting one.
 */
export function SignUpForm({ next }: { next: string | null }) {
  const t = useTranslations("app.auth");
  const locale = useLocale();
  const [organisation, setOrganisation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<{ email: string; purpose: "sign-in" | "verify" } | null>(
    null,
  );
  // The honeypot: a field people never see, so only bots fill it in.
  const [website, setWebsite] = useState("");

  const afterSignUp =
    next ?? `/app/welcome?${new URLSearchParams({ organisation: organisation.trim() })}`;

  async function sendLink() {
    setPending("link");
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: afterSignUp,
      newUserCallbackURL: afterSignUp,
      errorCallbackURL: "/app/sign-in?error=link",
      fetchOptions: { body: { website } },
    });
    setPending(null);
    if (error) {
      setError(messageOf(error, t("linkNotSent"), t("tooManyAttempts")));
      return;
    }
    setLinkSentTo({ email, purpose: "sign-in" });
  }

  /** The link that verifies a password sign-up; it signs in and continues to `afterSignUp`. */
  async function resendVerification() {
    setPending("password");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: afterSignUp });
    setPending(null);
    if (error) setError(messageOf(error, t("linkNotSent"), t("tooManyAttempts")));
  }

  async function signUpWithPassword() {
    if (password.length < 8) {
      setError(t("signUp.passwordTooShort"));
      return;
    }
    setPending("password");
    setError(null);
    const { error } = await authClient.signUp.email({
      name: email.split("@")[0],
      email,
      password,
      // Where the verification link lands, signed in: always inside /app.
      callbackURL: afterSignUp,
      fetchOptions: { body: { website } },
    });
    setPending(null);
    if (error) {
      setError(messageOf(error, t("signUp.accountNotCreated"), t("tooManyAttempts")));
      return;
    }
    setLinkSentTo({ email, purpose: "verify" });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter?.getAttribute("value") === "link") {
      void sendLink();
    } else {
      void signUpWithPassword();
    }
  }

  if (linkSentTo) {
    return (
      <CheckInbox
        email={linkSentTo.email}
        purpose={linkSentTo.purpose}
        resending={pending !== null}
        onResend={() => void (linkSentTo.purpose === "verify" ? resendVerification() : sendLink())}
        onChangeEmail={() => setLinkSentTo(null)}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          {next ? t("signUp.titleAccount") : t("signUp.titleOrganisation")}
        </CardTitle>
        <CardDescription>
          {next ? t("signUp.descriptionAccount") : t("signUp.descriptionOrganisation")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            {!next && (
              <Field>
                <FieldLabel htmlFor="organisation">{t("signUp.organisationName")}</FieldLabel>
                <Input
                  id="organisation"
                  placeholder={t("signUp.organisationPlaceholder")}
                  autoComplete="organization"
                  required
                  value={organisation}
                  onChange={(e) => setOrganisation(e.target.value)}
                />
              </Field>
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FieldDescription>{t("signUp.passwordHint")}</FieldDescription>
            </Field>
            <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            {error && <FieldError>{error}</FieldError>}
            <Field>
              <Button type="submit" value="password" disabled={pending !== null}>
                {pending === "password" && <Spinner />}
                {t("signUp.submit")}
              </Button>
            </Field>
            <FieldSeparator>{t("signUp.orSkip")}</FieldSeparator>
            <Field>
              <Button
                type="submit"
                value="link"
                variant="outline"
                disabled={pending !== null}
              >
                {pending === "link" && <Spinner />}
                {t("signUp.emailLink")}
              </Button>
              <FieldDescription className="text-center">
                {t("signUp.haveAccount")}{" "}
                <Link href={next ? `/app/sign-in?${new URLSearchParams({ next })}` : "/app/sign-in"}>
                  {t("signUp.signIn")}
                </Link>
              </FieldDescription>
              {/* Plain links: the legal pages are on the marketing site, under another root layout. */}
              <FieldDescription className="text-center">
                {t.rich("signUp.agree", {
                  terms: (chunks) => <a href={marketingPath(locale, "/terms")}>{chunks}</a>,
                  privacy: (chunks) => <a href={marketingPath(locale, "/privacy")}>{chunks}</a>,
                })}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
