"use client";

import { CircleCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// The one request form (Developers: "integration", every field; Contact:
// "contact", fewer). It posts JSON to /api/contact, which emails it to us and
// stores nothing. Contract: 200 {ok:true}; 400 {error:"invalid_email"|"invalid"};
// 429 {error:"rate_limited"}.

type Kind = "contact" | "integration";

const PAGE_BANDS = ["under300", "upTo1000", "upTo3000", "over3000", "unsure"] as const;

type Status =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent"; email: string }
  | { state: "error"; message: string; field?: "email" };

export function RequestForm({
  kind,
  fallbackEmail,
  className,
}: {
  kind: Kind;
  /** Shown when sending fails, so there's always a way through. */
  fallbackEmail: string;
  className?: string;
}) {
  const t = useTranslations("common.form");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [pages, setPages] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const integration = kind === "integration";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = String(data.get(name) ?? "").trim();
      return value === "" ? undefined : value;
    };
    const name = text("name");
    const email = text("email");
    if (!name) return setStatus({ state: "error", message: t("errors.name") });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setStatus({ state: "error", message: t("errors.email"), field: "email" });
    }
    setStatus({ state: "sending" });
    const body = {
      kind,
      name,
      email,
      company: text("company"),
      system: text("system"),
      documents: text("documents"),
      pagesPerMonth: pages ? t(`pages.${pages as (typeof PAGE_BANDS)[number]}`) : undefined,
      message: text("message"),
      website: String(data.get("website") ?? ""),
      locale,
    };
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) return setStatus({ state: "sent", email });
      const { error } = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.status === 429 || error === "rate_limited") {
        return setStatus({ state: "error", message: t("errors.rateLimited") });
      }
      if (error === "invalid_email") {
        return setStatus({ state: "error", message: t("errors.email"), field: "email" });
      }
      if (response.status === 400) return setStatus({ state: "error", message: t("errors.invalid") });
      setStatus({ state: "error", message: t("errors.failed", { email: fallbackEmail }) });
    } catch {
      setStatus({ state: "error", message: t("errors.failed", { email: fallbackEmail }) });
    }
  }

  if (status.state === "sent") {
    return (
      <div
        role="status"
        className={cn("flex flex-col items-start gap-3 rounded-2xl border bg-card p-6 sm:p-8", className)}
      >
        <CircleCheck className="size-7 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <h3 className="text-xl font-semibold">{t("sentTitle")}</h3>
        <p className="text-muted-foreground">{t("sentBody", { email: status.email })}</p>
        <Button
          variant="outline"
          onClick={() => {
            setStatus({ state: "idle" });
            setPages(null);
            setFormKey((k) => k + 1);
          }}
        >
          {t("sendAnother")}
        </Button>
      </div>
    );
  }

  const sending = status.state === "sending";
  const emailInvalid = status.state === "error" && status.field === "email";

  return (
    <form
      key={formKey}
      noValidate
      onSubmit={submit}
      className={cn("rounded-2xl border bg-card p-6 sm:p-8", className)}
    >
      <FieldGroup className="gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${kind}-name`}>{t("name")}</FieldLabel>
            <Input id={`${kind}-name`} name="name" autoComplete="name" required />
          </Field>
          <Field data-invalid={emailInvalid || undefined}>
            <FieldLabel htmlFor={`${kind}-email`}>{t("email")}</FieldLabel>
            <Input
              id={`${kind}-email`}
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={emailInvalid || undefined}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`${kind}-company`}>{integration ? t("company") : t("companyOptional")}</FieldLabel>
          <Input id={`${kind}-company`} name="company" autoComplete="organization" />
        </Field>
        {integration && (
          <>
            <Field>
              <FieldLabel htmlFor={`${kind}-system`}>{t("system")}</FieldLabel>
              <Input id={`${kind}-system`} name="system" placeholder={t("systemPlaceholder")} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${kind}-documents`}>{t("documents")}</FieldLabel>
                <Input id={`${kind}-documents`} name="documents" placeholder={t("documentsPlaceholder")} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${kind}-pages`}>{t("pagesPerMonth")}</FieldLabel>
                <Select
                  items={PAGE_BANDS.map((band) => ({ value: band, label: t(`pages.${band}`) }))}
                  value={pages}
                  onValueChange={(value) => setPages(value as string | null)}
                >
                  <SelectTrigger id={`${kind}-pages`} className="w-full">
                    <SelectValue placeholder={t("pagesChoose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_BANDS.map((band) => (
                      <SelectItem key={band} value={band}>
                        {t(`pages.${band}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </>
        )}
        <Field>
          <FieldLabel htmlFor={`${kind}-message`}>{integration ? t("note") : t("message")}</FieldLabel>
          <Textarea id={`${kind}-message`} name="message" rows={integration ? 3 : 5} />
        </Field>
        {/* Honeypot: people never see or fill it; simple bots do. */}
        <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label htmlFor={`${kind}-website`}>{t("website")}</label>
          <input id={`${kind}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        {status.state === "error" && (
          <Alert variant="destructive" aria-live="assertive">
            <AlertDescription>
              <FieldError className="text-inherit">{status.message}</FieldError>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-sm text-xs text-muted-foreground">{t("privacy")}</p>
          <Button type="submit" size="lg" className="h-10 px-5" disabled={sending}>
            {sending && <Spinner />}
            {sending ? t("sending") : t("submit")}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
