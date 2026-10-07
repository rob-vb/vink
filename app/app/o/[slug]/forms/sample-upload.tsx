"use client";

import { useAction, useMutation } from "convex/react";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type DragEvent, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_PDF_BYTES } from "@/convex/lib/pdfLimits";
import { cn } from "@/lib/utils";
import { useErrorText } from "../../../error-text";

/**
 * Drop one sample PDF: it is uploaded and a Form Proposal starts, for a new
 * Form or, with `formId`, to extend that Form. Then opens the proposal.
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
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError(t("notPdf"));
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
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      const { proposalId } = await create({ organisationSlug, key, filename: file.name, formId });
      router.push(`/app/o/${organisationSlug}/forms/proposals/${proposalId}`);
    } catch (e) {
      setError(errorText(e, t("failed")));
      setUploading(null);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files[0]);
  }

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
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={uploading !== null}
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
