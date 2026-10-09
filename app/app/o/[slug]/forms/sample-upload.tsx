"use client";

import { useAction, useMutation } from "convex/react";
import type { ConvexError } from "convex/values";
import { FileUp, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type DragEvent, type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_EMAIL_BODY_BYTES, MAX_PDF_BYTES } from "@/convex/lib/inputLimits";
import { isOutOfItems } from "@/lib/convex-error";
import { cn } from "@/lib/utils";
import { useErrorText } from "../../../error-text";

// What a sample can be. The server decides what a file is from its first bytes
// (convex/lib/sniff.ts); this only keeps an obviously wrong file from going up.
const ACCEPT =
  "application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png,image/heic,image/heif,.heic,.heif,message/rfc822,.eml";
const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  eml: "message/rfc822",
};

/** The MIME type the file is stored with, or null when Vink does not take it. Browsers often give HEIC and .eml no type, so the extension counts. */
function typeOf(file: File) {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const byExtension = TYPE_BY_EXTENSION[extension];
  if (byExtension !== undefined) return byExtension;
  return Object.values(TYPE_BY_EXTENSION).includes(file.type) ? file.type : null;
}

/**
 * Drop one sample (a PDF, a photo or an .eml email), or paste an email's
 * text: it is uploaded and a Form Proposal starts, for a new Form or, with
 * `formId`, to extend that Form. Then opens the proposal.
 */
export function SampleUpload({
  organisationSlug,
  formId,
}: {
  organisationSlug: string;
  formId?: Id<"forms">;
}) {
  const t = useTranslations("appForms.sample");
  const errorText = useErrorText();
  const router = useRouter();
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const create = useAction(api.formProposals.create);
  const createFromEmail = useAction(api.formProposals.createFromEmail);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [emailText, setEmailText] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // An out-of-Items refusal carries its numbers, so the sentence is built here in the app's language.
  const failure = (e: unknown) =>
    isOutOfItems(e)
      ? t("outOfItems", (e as ConvexError<{ remaining: number; needed: number }>).data)
      : errorText(e, t("failed"));

  async function upload(file: File | undefined) {
    setError(null);
    if (!file) return;
    const type = typeOf(file);
    if (type === null) {
      setError(t("notSupported"));
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(t("tooLarge"));
      return;
    }
    setUploading(file.name);
    try {
      const { key, url } = await generateUploadUrl({ organisationSlug });
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": type },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      const { proposalId } = await create({ organisationSlug, key, filename: file.name, formId });
      router.push(`/app/o/${organisationSlug}/forms/proposals/${proposalId}`);
    } catch (e) {
      setError(failure(e));
      setUploading(null);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files[0]);
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pasting || emailText.trim() === "") return;
    setPasting(true);
    setPasteError(null);
    try {
      const { proposalId } = await createFromEmail({
        organisationSlug,
        subject: subject.trim() || undefined,
        body: emailText,
        formId,
      });
      router.push(`/app/o/${organisationSlug}/forms/proposals/${proposalId}`);
    } catch (e) {
      setPasteError(failure(e));
      setPasting(false);
    }
  }

  const emailTooLarge = new TextEncoder().encode(emailText).length > MAX_EMAIL_BODY_BYTES;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="sample-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center text-sm transition-colors hover:bg-muted/50",
          dragging && "border-primary bg-muted/50",
          uploading && "pointer-events-none opacity-70",
        )}
      >
        {uploading ? (
          <>
            <Spinner className="mb-1" />
            <span>{t("uploading", { filename: uploading })}</span>
          </>
        ) : (
          <>
            <FileUp className="mb-1 size-5 text-muted-foreground" />
            <span>
              {t.rich("drop", {
                browse: (chunks) => <span className="font-medium underline">{chunks}</span>,
              })}
            </span>
            <span className="text-muted-foreground">{t("limit")}</span>
          </>
        )}
        <input
          id="sample-file"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={uploading !== null}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={pasteOpen}
        onOpenChange={(next) => {
          if (pasting) return;
          setPasteOpen(next);
          if (next) {
            setSubject("");
            setEmailText("");
            setPasteError(null);
          }
        }}
      >
        <DialogTrigger
          render={
            <Button type="button" variant="ghost" size="sm" className="self-start" disabled={uploading !== null}>
              <Mail />
              {t("pasteEmail")}
            </Button>
          }
        />
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submitEmail} className="flex min-w-0 flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{t("pasteTitle")}</DialogTitle>
              <DialogDescription>{t("pasteDescription")}</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="sample-email-subject">{t("emailSubject")}</FieldLabel>
                <Input
                  id="sample-email-subject"
                  value={subject}
                  disabled={pasting}
                  maxLength={200}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="sample-email-body">{t("emailBody")}</FieldLabel>
                <Textarea
                  id="sample-email-body"
                  value={emailText}
                  disabled={pasting}
                  rows={8}
                  className="max-h-64 overflow-y-auto"
                  placeholder={t("emailPlaceholder")}
                  aria-invalid={emailTooLarge}
                  onChange={(e) => setEmailText(e.target.value)}
                />
                {emailTooLarge && (
                  <p role="alert" className="text-sm text-destructive">
                    {t("emailTooLarge")}
                  </p>
                )}
              </Field>
              {pasteError && (
                <p role="alert" className="text-sm text-destructive">
                  {pasteError}
                </p>
              )}
            </FieldGroup>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pasting} />}>
                {t("cancel")}
              </DialogClose>
              <Button type="submit" disabled={pasting || emailText.trim() === "" || emailTooLarge}>
                {pasting && <Spinner />}
                {t("useEmail")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
