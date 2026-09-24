"use client";

import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { FileUp, Upload, X } from "lucide-react";
import { useState, type DragEvent, type FormEvent } from "react";
import { toast } from "sonner";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type Form = { id: Id<"forms">; name: string };

export function UploadDialog({
  organisationSlug,
  forms,
}: {
  organisationSlug: string;
  forms: Form[];
}) {
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const create = useAction(api.documents.create);
  const [open, setOpen] = useState(false);
  const [formId, setFormId] = useState<Id<"forms"> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (uploading) return;
    setOpen(next);
    if (next) {
      setFormId(forms.length === 1 ? forms[0].id : null);
      setFile(null);
      setError(null);
    }
  }

  function choose(chosen: File | undefined) {
    setError(null);
    if (!chosen) return;
    if (chosen.type !== "application/pdf" && !chosen.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF file.");
      return;
    }
    setFile(chosen);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !formId) return;
    setUploading(true);
    setError(null);
    try {
      const { key, url } = await generateUploadUrl({ organisationSlug });
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      await create({ organisationSlug, formId, key, filename: file.name });
      toast.success(`${file.name} uploaded`);
      setOpen(false);
    } catch (error) {
      setError(
        error instanceof ConvexError
          ? String(error.data)
          : "We couldn't upload the PDF. Try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  const formItems = forms.map((f) => ({ value: f.id, label: f.name }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button>
            <Upload />
            Upload PDF
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Upload a PDF</DialogTitle>
            <DialogDescription>
              DocuHelper fills the Form you choose from all of its pages.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="upload-form">Form</FieldLabel>
              <Select
                items={formItems}
                value={formId}
                onValueChange={(value) => setFormId(value as Id<"forms"> | null)}
              >
                <SelectTrigger id="upload-form" className="w-full">
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
              <FieldLabel htmlFor="upload-file">PDF</FieldLabel>
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                  <FileUp className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove file"
                    disabled={uploading}
                    onClick={() => setFile(null)}
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="upload-file"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center text-sm transition-colors hover:bg-muted/50",
                    dragging && "border-primary bg-muted/50",
                  )}
                >
                  <FileUp className="mb-1 size-5 text-muted-foreground" />
                  <span>
                    Drop a PDF here, or <span className="font-medium underline">browse</span>
                  </span>
                  <span className="text-muted-foreground">Up to 20 pages</span>
                  <input
                    id="upload-file"
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(e) => choose(e.target.files?.[0])}
                  />
                </label>
              )}
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" disabled={uploading} />}
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={uploading || !file || !formId}>
              {uploading && <Spinner />}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
