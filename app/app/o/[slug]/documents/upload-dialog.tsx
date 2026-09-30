"use client";

import { useAction, useMutation } from "convex/react";
import { CircleCheck, FileUp, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
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
import { errorText, isOutOfPages } from "@/lib/convex-error";
import { cn } from "@/lib/utils";
import { UpgradeButton } from "../pages-usage";

type Form = { id: Id<"forms">; name: string };

// One row per chosen file: each goes through upload and create on its own, so
// one refused file never holds up the rest.
type Item = {
  id: string;
  file: File;
  status: "ready" | "uploading" | "done" | "failed";
  progress: number;
  error: string | null;
  outOfPages: boolean;
};

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** PUTs the file to the upload URL, reporting progress (fetch can't). */
function put(url: string, file: File, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", "application/pdf");
    request.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`Upload failed: ${request.status}`));
    request.onerror = () => reject(new Error("Upload failed"));
    request.send(file);
  });
}

export function UploadDialog({
  organisationSlug,
  forms,
}: {
  organisationSlug: string;
  forms: Form[];
}) {
  const router = useRouter();
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const create = useAction(api.documents.create);
  const [open, setOpen] = useState(false);
  const [formId, setFormId] = useState<Id<"forms"> | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  function onOpenChange(next: boolean) {
    if (uploading) return;
    setOpen(next);
    if (next) {
      setFormId(forms.length === 1 ? forms[0].id : null);
      setItems([]);
    }
  }

  function update(id: string, patch: Partial<Item>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function choose(chosen: FileList | null) {
    if (!chosen) return;
    const added = Array.from(chosen).map(
      (file): Item => ({
        id: crypto.randomUUID(),
        file,
        status: isPdf(file) ? "ready" : "failed",
        progress: 0,
        error: isPdf(file) ? null : "Not a PDF.",
        outOfPages: false,
      }),
    );
    setItems((current) => [...current, ...added]);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files);
  }

  async function uploadOne(item: Item, form: Id<"forms">) {
    update(item.id, { status: "uploading", progress: 0, error: null });
    try {
      const { key, url } = await generateUploadUrl({ organisationSlug });
      await put(url, item.file, (fraction) => update(item.id, { progress: fraction * 90 }));
      await create({ organisationSlug, formId: form, key, filename: item.file.name });
      update(item.id, { status: "done", progress: 100 });
      return true;
    } catch (error) {
      update(item.id, {
        status: "failed",
        error: errorText(error, "We couldn't upload this PDF. Try again."),
        outOfPages: isOutOfPages(error),
      });
      return false;
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formId) return;
    const queue = items.filter((item) => item.status === "ready");
    if (queue.length === 0) return;
    setUploading(true);
    let uploaded = 0;
    // One at a time, so each PDF's Pages are counted in order.
    for (const item of queue) {
      if (await uploadOne(item, formId)) uploaded++;
    }
    setUploading(false);
    if (uploaded === 0) return;
    toast.success(uploaded === 1 ? "1 PDF uploaded" : `${uploaded} PDFs uploaded`, {
      description: "Vink is reading them now.",
      action: {
        label: "View",
        onClick: () => router.push(`/app/o/${organisationSlug}/documents/extracting`),
      },
    });
    // Close only when nothing needs the user's attention.
    if (uploaded === queue.length && items.every((item) => item.status !== "failed")) {
      setOpen(false);
    }
  }

  const formItems = forms.map((f) => ({ value: f.id, label: f.name }));
  const ready = items.filter((item) => item.status === "ready").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button>
            <Upload />
            Upload PDFs
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Upload PDFs</DialogTitle>
            <DialogDescription>
              Each PDF becomes its own Document. Vink fills the Form you choose from all of
              its pages.
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
              <FieldLabel htmlFor="upload-file">PDFs</FieldLabel>
              <label
                htmlFor="upload-file"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors hover:bg-muted/50",
                  dragging && "border-primary bg-muted/50",
                  uploading && "pointer-events-none opacity-60",
                )}
              >
                <FileUp className="mb-1 size-5 text-muted-foreground" />
                <span>
                  Drop PDFs here, or <span className="font-medium underline">browse</span>
                </span>
                <span className="text-muted-foreground">Up to 20 pages each</span>
                <input
                  id="upload-file"
                  type="file"
                  multiple
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    choose(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {items.length > 0 && (
                <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                  {items.map((item) => (
                    <FileRow
                      key={item.id}
                      item={item}
                      disabled={uploading}
                      onRemove={() =>
                        setItems((current) => current.filter((i) => i.id !== item.id))
                      }
                    />
                  ))}
                </ul>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" disabled={uploading} />}
            >
              {items.some((item) => item.status === "done") ? "Close" : "Cancel"}
            </DialogClose>
            <Button type="submit" disabled={uploading || ready === 0 || !formId}>
              {uploading && <Spinner />}
              {ready > 1 ? `Upload ${ready} PDFs` : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FileRow({
  item,
  disabled,
  onRemove,
}: {
  item: Item;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        {item.status === "done" ? (
          <CircleCheck className="size-4 shrink-0 text-green-600" />
        ) : (
          <FileUp className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
        {item.status === "uploading" && <Spinner className="size-4" />}
        {(item.status === "ready" || item.status === "failed") && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${item.file.name}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <X />
          </Button>
        )}
      </div>
      {item.status === "uploading" && <Progress value={item.progress} aria-label="Upload progress" />}
      {item.error && (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-destructive">
            {item.error}
          </p>
          {item.outOfPages && <UpgradeButton />}
        </div>
      )}
    </li>
  );
}
