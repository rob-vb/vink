"use client";

import { useMutation } from "convex/react";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { MAX_DESCRIPTION_CHARS } from "@/convex/lib/formDescription";
import { useErrorText } from "../../../../error-text";

/**
 * "Describe in words": the Admin writes what the document is and which data
 * they need; Vink proposes the Fields (a Form Proposal without a sample).
 * Nothing is read, so no Items are used.
 */
export function DescribeForm({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("appForms.describe");
  const errorText = useErrorText();
  const router = useRouter();
  const createFromDescription = useMutation(api.formProposals.createFromDescription);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooLong = text.trim().length > MAX_DESCRIPTION_CHARS;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || text.trim() === "" || tooLong) return;
    setBusy(true);
    setError(null);
    try {
      const { proposalId } = await createFromDescription({ organisationSlug, description: text });
      router.push(`/app/o/${organisationSlug}/forms/proposals/${proposalId}`);
    } catch (e) {
      setError(errorText(e, t("failed")));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="form-describe">{t("label")}</FieldLabel>
        <Textarea
          id="form-describe"
          value={text}
          disabled={busy}
          rows={5}
          placeholder={t("placeholder")}
          aria-invalid={tooLong}
          onChange={(e) => setText(e.target.value)}
        />
        <FieldDescription className={tooLong ? "text-destructive" : undefined}>
          {t("count", { count: text.trim().length, max: MAX_DESCRIPTION_CHARS })}
        </FieldDescription>
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="self-start" disabled={busy || text.trim() === "" || tooLong}>
        {busy ? <Spinner /> : <Sparkles />}
        {t("submit")}
      </Button>
    </form>
  );
}
