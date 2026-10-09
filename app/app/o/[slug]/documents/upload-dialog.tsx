"use client";

import { useAction, useMutation } from "convex/react";
import type { ConvexError } from "convex/values";
import { CircleCheck, FileUp, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type DragEvent, type FormEvent, type ReactNode } from "react";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_EMAIL_BODY_BYTES, MAX_PDF_BYTES } from "@/convex/lib/inputLimits";
import { isOutOfItems } from "@/lib/convex-error";
import { cn } from "@/lib/utils";
import { useErrorText } from "../../../error-text";
import { UpgradeButton } from "../items-usage";

type Form = { id: Id<"forms">; name: string };

// One row per chosen file: each goes through upload and create on its own, so
// one refused file never holds up the rest.
type Item = {
  id: string;
  file: File;
  status: "ready" | "uploading" | "done" | "failed";
  progress: number;
  error: string | null;
  outOfItems: boolean;
};

// What Vink takes. The server decides what a file is from its first bytes
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

// "Vink picks the Form" is not a Form: the Router chooses it after Read (ADR 0010).
const ROUTER = "router";

/** PUTs the file to the upload URL, reporting progress (fetch can't). */
function put(url: string, file: File, type: string, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", type);
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
  isAdmin,
}: {
  organisationSlug: string;
  forms: Form[];
  isAdmin: boolean;
}) {
  const t = useTranslations("appDocuments");
  const errorText = useErrorText();
  const router = useRouter();
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const create = useAction(api.documents.create);
  const createEmail = useAction(api.documents.createEmail);
  const [open, setOpen] = useState(false);
  const [formChoice, setFormChoice] = useState<string>(ROUTER);
  const [tab, setTab] = useState<"files" | "email">("files");
  const [subject, setSubject] = useState("");
  const [emailText, setEmailText] = useState("");
  const [emailError, setEmailError] = useState<{ text: string; outOfItems: boolean } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  function onOpenChange(next: boolean) {
    if (uploading) return;
    setOpen(next);
    if (next) {
      // One Form: that one. Otherwise Vink picks.
      setFormChoice(forms.length === 1 ? forms[0].id : ROUTER);
      setItems([]);
      setTab("files");
      setSubject("");
      setEmailText("");
      setEmailError(null);
    }
  }

  function update(id: string, patch: Partial<Item>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function choose(chosen: FileList | null) {
    if (!chosen) return;
    const added = Array.from(chosen).map((file): Item => {
      // Refused here, before any upload; Vink checks the type and size again.
      const error = typeOf(file) === null
        ? t("upload.notSupported")
        : file.size > MAX_PDF_BYTES
          ? t("upload.tooLarge")
          : null;
      return {
        id: crypto.randomUUID(),
        file,
        status: error === null ? "ready" : "failed",
        progress: 0,
        error,
        outOfItems: false,
      };
    });
    setItems((current) => [...current, ...added]);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files);
  }

  async function uploadOne(item: Item, form: Id<"forms"> | undefined) {
    update(item.id, { status: "uploading", progress: 0, error: null });
    try {
      const { key, url } = await generateUploadUrl({ organisationSlug });
      await put(url, item.file, typeOf(item.file) ?? "application/octet-stream", (fraction) =>
        update(item.id, { progress: fraction * 90 }),
      );
      await create({ organisationSlug, formId: form, key, filename: item.file.name });
      update(item.id, { status: "done", progress: 100 });
      return true;
    } catch (error) {
      const outOfItems = isOutOfItems(error);
      update(item.id, {
        status: "failed",
        // Out of Items carries its numbers, so the sentence is built here in the app's language.
        error: outOfItems
          ? t("upload.outOfItems", (error as ConvexError<{ remaining: number; needed: number }>).data)
          : errorText(error, t("upload.failed")),
        outOfItems,
      });
      return false;
    }
  }

  function toastUploaded(count: number) {
    toast.success(t("upload.uploaded", { count }), {
      description: t("upload.readingNow"),
      action: {
        label: t("upload.view"),
        onClick: () => router.push(`/app/o/${organisationSlug}/documents/extracting`),
      },
    });
  }

  async function submitEmail(form: Id<"forms"> | undefined) {
    setUploading(true);
    setEmailError(null);
    try {
      await createEmail({ organisationSlug, formId: form, subject: subject.trim() || undefined, body: emailText });
      toastUploaded(1);
      setOpen(false);
    } catch (error) {
      const outOfItems = isOutOfItems(error);
      setEmailError({
        text: outOfItems
          ? t("upload.outOfItems", (error as ConvexError<{ remaining: number; needed: number }>).data)
          : errorText(error, t("upload.emailFailed")),
        outOfItems,
      });
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading) return;
    const form = formChoice === ROUTER ? undefined : (formChoice as Id<"forms">);
    if (tab === "email") {
      if (emailText.trim() !== "") await submitEmail(form);
      return;
    }
    const queue = items.filter((item) => item.status === "ready");
    if (queue.length === 0) return;
    setUploading(true);
    let uploaded = 0;
    // One at a time, so each file's Items are counted in order.
    for (const item of queue) {
      if (await uploadOne(item, form)) uploaded++;
    }
    setUploading(false);
    if (uploaded === 0) return;
    toastUploaded(uploaded);
    // Close only when nothing needs the user's attention.
    if (uploaded === queue.length && items.every((item) => item.status !== "failed")) {
      setOpen(false);
    }
  }

  // The same wording as the Email-in dialog's choice of an Intake Address.
  const formItems = [
    { value: ROUTER as string, label: t("emailIn.organisation") },
    ...forms.map((f) => ({ value: f.id as string, label: f.name })),
  ];
  const ready = items.filter((item) => item.status === "ready").length;
  const emailTooLarge = new TextEncoder().encode(emailText).length > MAX_EMAIL_BODY_BYTES;
  const canSubmit = tab === "email" ? emailText.trim() !== "" && !emailTooLarge : ready > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button>
            <Upload />
            {t("upload.button")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{t("upload.title")}</DialogTitle>
            <DialogDescription>{t("upload.description")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="upload-form">{t("form")}</FieldLabel>
              <Select
                items={formItems}
                value={formChoice}
                onValueChange={(value) => setFormChoice(value ?? ROUTER)}
              >
                <SelectTrigger id="upload-form" className="w-full">
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
            <Tabs value={tab} onValueChange={(value) => setTab(value as "files" | "email")}>
              <TabsList>
                <TabsTrigger value="files" disabled={uploading}>
                  {t("upload.tabFiles")}
                </TabsTrigger>
                <TabsTrigger value="email" disabled={uploading}>
                  {t("upload.tabEmail")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="files" className="flex flex-col gap-2">
                <FieldLabel htmlFor="upload-file">{t("upload.files")}</FieldLabel>
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
                    {t.rich("upload.drop", {
                      browse: (chunks) => <span className="font-medium underline">{chunks}</span>,
                    })}
                  </span>
                  <span className="text-muted-foreground">{t("upload.limit")}</span>
                  <input
                    id="upload-file"
                    type="file"
                    multiple
                    accept={ACCEPT}
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
                        upgrade={isAdmin && <UpgradeButton organisationSlug={organisationSlug} />}
                        disabled={uploading}
                        onRemove={() =>
                          setItems((current) => current.filter((i) => i.id !== item.id))
                        }
                      />
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="email" className="flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="upload-email-subject">{t("upload.emailSubject")}</FieldLabel>
                  <Input
                    id="upload-email-subject"
                    value={subject}
                    disabled={uploading}
                    maxLength={200}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="upload-email-body">{t("upload.emailBody")}</FieldLabel>
                  <Textarea
                    id="upload-email-body"
                    value={emailText}
                    disabled={uploading}
                    rows={8}
                    className="max-h-64 overflow-y-auto"
                    placeholder={t("upload.emailPlaceholder")}
                    aria-invalid={emailTooLarge}
                    onChange={(e) => setEmailText(e.target.value)}
                  />
                  {emailTooLarge && (
                    <p role="alert" className="text-sm text-destructive">
                      {t("upload.emailTooLarge")}
                    </p>
                  )}
                </Field>
                {emailError && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <p role="alert" className="text-destructive">
                      {emailError.text}
                    </p>
                    {emailError.outOfItems && isAdmin && <UpgradeButton organisationSlug={organisationSlug} />}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" disabled={uploading} />}
            >
              {items.some((item) => item.status === "done") ? t("upload.close") : t("cancel")}
            </DialogClose>
            <Button type="submit" disabled={uploading || !canSubmit}>
              {uploading && <Spinner />}
              {tab === "email" ? t("upload.submitEmail") : t("upload.submit", { count: ready })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FileRow({
  item,
  upgrade,
  disabled,
  onRemove,
}: {
  item: Item;
  /** For Admins, next to an out-of-Items refusal. */
  upgrade: ReactNode;
  disabled: boolean;
  onRemove: () => void;
}) {
  const t = useTranslations("appDocuments.upload");
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
            aria-label={t("remove", { filename: item.file.name })}
            disabled={disabled}
            onClick={onRemove}
          >
            <X />
          </Button>
        )}
      </div>
      {item.status === "uploading" && <Progress value={item.progress} aria-label={t("progress")} />}
      {item.error && (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-destructive">
            {item.error}
          </p>
          {item.outOfItems && upgrade}
        </div>
      )}
    </li>
  );
}
