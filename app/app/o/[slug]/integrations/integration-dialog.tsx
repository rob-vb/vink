"use client";

import { useAction, useMutation } from "convex/react";
import { ExternalLink, Plus, Sheet, Webhook, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactElement, useState } from "react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorText } from "../../../error-text";

type Header = { name: string; value: string; secret: boolean; stored: boolean };

type Kind = "webhook" | "google_sheets";

export type IntegrationValues = {
  id: Id<"integrations">;
  name: string;
  kind: Kind;
  // A Webhook's endpoint, or the link to a Google Sheets Integration's sheet.
  url: string;
  headers: Array<{ name: string; value: string; secret: boolean }>;
};

/**
 * Creates an Integration, or edits one. A stored secret header shows masked
 * and is kept unless the Admin types a new value. A Google Sheets Integration
 * is made by connecting a Google account: the Admin goes to Google's consent
 * page and comes back to the Integrations page (app/api/integrations/google).
 */
export function IntegrationDialog({
  organisationSlug,
  integration,
  trigger,
}: {
  organisationSlug: string;
  integration?: IntegrationValues;
  trigger: ReactElement;
}) {
  const t = useTranslations("appIntegrations.dialog");
  const errorText = useErrorText();
  const create = useMutation(api.integrations.create);
  const update = useMutation(api.integrations.update);
  const rename = useMutation(api.integrations.rename);
  const connectUrl = useAction(api.googleSheets.connectUrl);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("webhook");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<Header[]>([]);
  const [pending, setPending] = useState(false);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) return;
    setKind(integration?.kind ?? "webhook");
    setName(integration?.name ?? "");
    setUrl(integration?.url ?? "https://");
    setHeaders(
      integration?.headers.map((h) => ({
        name: h.name,
        value: h.secret ? "" : h.value,
        secret: h.secret,
        stored: h.secret,
      })) ?? [],
    );
  }

  const setHeader = (index: number, patch: Partial<Header>) =>
    setHeaders(headers.map((h, i) => (i === index ? { ...h, ...patch } : h)));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      if (kind === "google_sheets") {
        if (integration) {
          await rename({ organisationSlug, integrationId: integration.id, name });
        } else {
          // Off to Google; the page is left, so `pending` stays on.
          const { url } = await connectUrl({ organisationSlug, name });
          window.location.assign(url);
          return;
        }
      } else if (integration) {
        await update({
          organisationSlug,
          integrationId: integration.id,
          name,
          url,
          headers: headers.map((h) => ({
            name: h.name.trim(),
            secret: h.secret,
            value: h.stored && h.value === "" ? null : h.value,
          })),
        });
      } else {
        await create({
          organisationSlug,
          name,
          url,
          headers: headers.map((h) => ({ name: h.name.trim(), secret: h.secret, value: h.value })),
        });
      }
      setOpen(false);
      setPending(false);
    } catch (error) {
      toast.error(errorText(error, t("notSaved")));
      setPending(false);
    }
  }

  const sheets = kind === "google_sheets";

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{integration ? t("editTitle") : t("newTitle")}</DialogTitle>
            <DialogDescription>{sheets ? t("sheetsDescription") : t("description")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {!integration && (
              <Field>
                <FieldLabel>{t("kind")}</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  aria-label={t("kind")}
                  value={[kind]}
                  onValueChange={(value) => value[0] && setKind(value[0] as Kind)}
                >
                  <ToggleGroupItem value="webhook">
                    <Webhook />
                    {t("webhook")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="google_sheets">
                    <Sheet />
                    {t("googleSheets")}
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="integration-name">{t("name")}</FieldLabel>
              <Input
                id="integration-name"
                value={name}
                placeholder={sheets ? t("sheetNamePlaceholder") : t("namePlaceholder")}
                onChange={(e) => setName(e.target.value)}
              />
              {sheets && !integration && <FieldDescription>{t("sheetNameHint")}</FieldDescription>}
            </Field>
            {sheets && !integration && (
              <ul className="flex list-disc flex-col gap-1 rounded-md border bg-muted/40 py-3 pr-3 pl-7 text-sm text-muted-foreground">
                <li>{t("connectSignIn")}</li>
                <li>{t("connectAccess")}</li>
                <li>{t("connectRows")}</li>
              </ul>
            )}
            {sheets && integration && (
              <a
                href={integration.url}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
              >
                {t("openSheet")}
                <ExternalLink className="size-3.5" />
              </a>
            )}
            {!sheets && (
              <>
                <Field>
                  <FieldLabel htmlFor="integration-url">{t("url")}</FieldLabel>
                  <Input
                    id="integration-url"
                    className="font-mono"
                    value={url}
                    inputMode="url"
                    spellCheck={false}
                    onChange={(e) => setUrl(e.target.value.trim())}
                  />
                  <FieldDescription>{t("urlHint")}</FieldDescription>
                </Field>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-medium">{t("headers")}</p>
                    <p className="text-sm text-muted-foreground">{t("headersHint")}</p>
                  </div>
                  {headers.map((header, i) => (
                    <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]">
                      <Input
                        aria-label={t("headerName", { n: i + 1 })}
                        className="font-mono"
                        placeholder="Authorization"
                        value={header.name}
                        onChange={(e) => setHeader(i, { name: e.target.value })}
                      />
                      <Input
                        aria-label={t("headerValue", { n: i + 1 })}
                        className="font-mono"
                        type={header.secret ? "password" : "text"}
                        autoComplete="off"
                        placeholder={header.stored ? t("unchanged") : "Bearer …"}
                        value={header.value}
                        onChange={(e) => setHeader(i, { value: e.target.value })}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`header-${i}-secret`}
                            checked={header.secret}
                            disabled={header.stored}
                            onCheckedChange={(secret) => setHeader(i, { secret })}
                          />
                          <Label htmlFor={`header-${i}-secret`} className="text-sm">
                            {t("secret")}
                          </Label>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("removeHeader", { n: i + 1 })}
                          onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() =>
                      setHeaders([...headers, { name: "", value: "", secret: true, stored: false }])
                    }
                  >
                    <Plus />
                    {t("addHeader")}
                  </Button>
                </div>
              </>
            )}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {integration ? t("save") : sheets ? t("connect") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
