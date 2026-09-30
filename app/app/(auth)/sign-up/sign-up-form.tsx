"use client";

import Link from "next/link";
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
import { authClient } from "@/lib/auth-client";

type Pending = "password" | "link" | null;

/** Better Auth's own answer to a per-IP limit is too technical; others are shown as they are. */
function messageOf(error: { status?: number; message?: string }, fallback: string) {
  if (error.status === 429 && error.message?.startsWith("Too many requests")) {
    return "Too many attempts from here. Wait a few minutes and try again.";
  }
  return error.message ?? fallback;
}

/**
 * Signs up and creates the user's own Organisation, or, when `next` is an
 * invite link, signs up only and returns there to join the inviting one.
 */
export function SignUpForm({ next }: { next: string | null }) {
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
      setError(messageOf(error, "We couldn't send the link. Try again."));
      return;
    }
    setLinkSentTo({ email, purpose: "sign-in" });
  }

  /** The link that verifies a password sign-up; it signs in and continues to `afterSignUp`. */
  async function resendVerification() {
    setPending("password");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: afterSignUp });
    setPending(null);
    if (error) setError(messageOf(error, "We couldn't send the link. Try again."));
  }

  async function signUpWithPassword() {
    if (password.length < 8) {
      setError("Choose a password of at least 8 characters, or email yourself a link.");
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
      setError(messageOf(error, "We couldn't create your account. Try again."));
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
          {next ? "Create your account" : "Create your Organisation"}
        </CardTitle>
        <CardDescription>
          {next
            ? "Use the address your invitation was sent to."
            : "You'll be its Admin and can invite your team later."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            {!next && (
              <Field>
                <FieldLabel htmlFor="organisation">Organisation name</FieldLabel>
                <Input
                  id="organisation"
                  placeholder="Acme Fleet"
                  autoComplete="organization"
                  required
                  value={organisation}
                  onChange={(e) => setOrganisation(e.target.value)}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="email">Work email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FieldDescription>At least 8 characters.</FieldDescription>
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
                Create account
              </Button>
            </Field>
            <FieldSeparator>or skip the password</FieldSeparator>
            <Field>
              <Button
                type="submit"
                value="link"
                variant="outline"
                disabled={pending !== null}
              >
                {pending === "link" && <Spinner />}
                Email me a sign-up link
              </Button>
              <FieldDescription className="text-center">
                Already have an account?{" "}
                <Link href={next ? `/app/sign-in?${new URLSearchParams({ next })}` : "/app/sign-in"}>
                  Sign in
                </Link>
              </FieldDescription>
              {/* Plain links: the legal pages are on the marketing site, under another root layout. */}
              <FieldDescription className="text-center">
                By creating an account you agree to the{" "}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/terms">Terms</a> and{" "}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/privacy">Privacy policy</a>.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
