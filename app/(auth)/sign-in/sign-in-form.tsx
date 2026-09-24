"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function SignInForm({ linkFailed }: { linkFailed: boolean }) {
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
      callbackURL: "/",
      newUserCallbackURL: "/welcome",
      errorCallbackURL: "/sign-in?error=link",
    });
    setPending(null);
    if (error) {
      setError(error.message ?? "We couldn't send the link. Try again.");
      return;
    }
    setLinkSentTo(email);
  }

  async function signInWithPassword() {
    if (!password) {
      setError("Enter your password, or email yourself a link.");
      return;
    }
    setPending("password");
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setPending(null);
      setError("That email and password don't match.");
      return;
    }
    router.push("/");
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
        <CardTitle className="text-xl">Sign in to DocuHelper</CardTitle>
        <CardDescription>Use your password or get a link by email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            {linkFailed && (
              <Alert variant="destructive">
                <AlertDescription>
                  That sign-in link has expired or was already used. Request a new one.
                </AlertDescription>
              </Alert>
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Field>
              <Button type="submit" value="password" disabled={pending !== null}>
                {pending === "password" && <Spinner />}
                Sign in
              </Button>
            </Field>
            <FieldSeparator>or</FieldSeparator>
            <Field>
              <Button
                type="submit"
                value="link"
                variant="outline"
                disabled={pending !== null}
              >
                {pending === "link" && <Spinner />}
                Email me a sign-in link
              </Button>
              <FieldDescription className="text-center">
                New to DocuHelper? <Link href="/sign-up">Create an Organisation</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
