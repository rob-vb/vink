"use client";

import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { CircleCheck, CircleX, Send } from "lucide-react";
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

type Result = FunctionReturnType<typeof api.integrations.testSend>;

const EXAMPLE = "example";

/**
 * Sends a test envelope (`"test": true`) and shows the receiver's answer. Not
 * a Delivery: nothing is logged or retried.
 */
export function TestSendButton({
  organisationSlug,
  integrationId,
  forms,
}: {
  organisationSlug: string;
  integrationId: Id<"integrations">;
  forms: Array<{ id: Id<"forms">; name: string }>;
}) {
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
    { value: EXAMPLE, label: "Dummy data from the Form" },
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
        error: error instanceof ConvexError ? String(error.data) : "The test didn't go out.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={forms.length === 0} />}>
        <Send />
        Send test
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a test</DialogTitle>
          <DialogDescription>
            Posts a signed envelope marked <code className="font-mono">&quot;test&quot;: true</code>,
            so your receiver can check the format. It isn&apos;t a Delivery.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="test-form">Form</FieldLabel>
            <Select
              items={formItems}
              value={formId}
              onValueChange={(value) => {
                setFormId(value as Id<"forms"> | null);
                setSource(EXAMPLE);
              }}
            >
              <SelectTrigger id="test-form" className="w-full">
                <SelectValue placeholder="Choose a Form" />
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
            <FieldLabel htmlFor="test-source">Data</FieldLabel>
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
            <FieldDescription>
              Dummy data, or an Approved Document of this Form. Documents still in review are never
              sent.
            </FieldDescription>
          </Field>
          {source === EXAMPLE && (
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[mode]}
              onValueChange={(value) => value[0] && setMode(value[0] as typeof mode)}
            >
              <ToggleGroupItem value="examples">Example values</ToggleGroupItem>
              <ToggleGroupItem value="empty">Optional values empty</ToggleGroupItem>
            </ToggleGroup>
          )}
        </FieldGroup>
        <Button onClick={send} disabled={formId === null || pending} className="w-fit">
          {pending ? <Spinner /> : <Send />}
          Send test
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
                  Response status <Badge variant="outline">{result.status}</Badge>
                </>
              ) : (
                result.error
              )}
            </p>
            {result.body !== null && (
              <pre className="max-h-48 overflow-auto rounded bg-background p-2 font-mono text-xs whitespace-pre-wrap break-all">
                {result.body || "(empty body)"}
              </pre>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
