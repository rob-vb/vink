"use client";

import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CircleCheck, CircleX, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "cn";
import { useErrorText } from "../../../error-text";

type Result = FunctionReturnType<typeof api.integrations.testSend>;

const EXAMPLE = "example";

/**
 * Sends a test envelope (`"test": true`) and shows the receiver's answer. Not
 * a Delivery: nothing is logged or retried.
 */
export function TestSendButton({
  organisationSlug,
  integrationId,
  kind,
  forms,
}: {
  organisationSlug: string;
  integrationId: Id<"integrations">;
  kind: "webhook" | "google_sheets";
  forms: Array<{ id: Id<"forms">; name: string }>;
}) {
  const t = useTranslations("appIntegrations.test");
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [formId, setFormId] = useState<Id<"forms"> | null>(forms[0]?.id ?? null);
  const [mode, setMode] = useState<"examples" | "empty">("examples");
  const [source, setSource] = useState<string>(EXAMPLE);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const testSend = useAction(api.integrations.testSend);
  const documents = useQuery(
    api.integrations.testDocuments,
    open && formId ? { organisationSlug, formId } : "skip",
  );
  const formItems = forms.map((f) => ({ value: f.id, label: f.name }));
  const sourceItems = [
    { value: EXAMPLE, label: t("dummy") },
    ...(documents ?? []).map((d) => ({ value: d.id, label: d.filename })),
  ];

  async function send() {
    if (formId === null) return;
    setPending(true);
    setResult(null);
    try {
      setResult(
        await testSend({
          organisationSlug,
          integrationId,
          formId,
          mode,
          documentId: source === EXAMPLE ? undefined : (source as Id<"documents">),
        }),
      );
    } catch (error) {
      setResult({
        ok: false,
        status: null,
        body: null,
        error: errorText(error, t("notSent")),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={forms.length === 0} />}>
        <Send />
        {t("button")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t.rich(kind === "google_sheets" ? "sheetsDescription" : "description", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="test-form">{t("form")}</FieldLabel>
            <Select
              items={formItems}
              value={formId}
              onValueChange={(value) => {
                setFormId(value as Id<"forms"> | null);
                setSource(EXAMPLE);
              }}
            >
              <SelectTrigger id="test-form" className="w-full">
                <SelectValue placeholder={t("chooseForm")} />
              </SelectTrigger>
              <SelectContent>
                {formItems.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="test-source">{t("data")}</FieldLabel>
            <Select items={sourceItems} value={source} onValueChange={(v) => setSource(v ?? EXAMPLE)}>
              <SelectTrigger id="test-source" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sourceItems.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{t("dataHint")}</FieldDescription>
          </Field>
          {source === EXAMPLE && (
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[mode]}
              onValueChange={(value) => value[0] && setMode(value[0] as typeof mode)}
            >
              <ToggleGroupItem value="examples">{t("examples")}</ToggleGroupItem>
              <ToggleGroupItem value="empty">{t("empty")}</ToggleGroupItem>
            </ToggleGroup>
          )}
        </FieldGroup>
        <Button onClick={send} disabled={formId === null || pending} className="w-fit">
          {pending ? <Spinner /> : <Send />}
          {t("button")}
        </Button>
        {result && (
          <div
            className={cn(
              "flex flex-col gap-2 rounded-md border p-3",
              result.ok
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                : "border-destructive/40 bg-destructive/5",
            )}
            role="status"
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              {result.ok ? (
                <CircleCheck className="size-4 text-emerald-600" />
              ) : (
                <CircleX className="size-4 text-destructive" />
              )}
              {result.status !== null ? (
                <>
                  {t("status")} <Badge variant="outline">{result.status}</Badge>
                </>
              ) : (
                result.error
              )}
            </p>
            {result.body !== null && (
              <pre className="max-h-48 overflow-auto rounded bg-background p-2 font-mono text-xs whitespace-pre-wrap break-all">
                {result.body || t("emptyBody")}
              </pre>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
