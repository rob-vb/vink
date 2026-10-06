"use client";

import { useMutation, useQuery } from "convex/react";
import { Copy, Eye, Pencil, Plug, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DeliveryRow, ResendButton } from "@/components/deliveries/delivery-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useErrorText } from "../../../error-text";
import { IntegrationDialog } from "./integration-dialog";
import { TestSendButton } from "./test-send";

function SigningSecret({
  organisationSlug,
  integrationId,
}: {
  organisationSlug: string;
  integrationId: Id<"integrations">;
}) {
  const t = useTranslations("appIntegrations");
  const [shown, setShown] = useState(false);
  const secret = useQuery(
    api.integrations.signingSecret,
    shown ? { organisationSlug, integrationId } : "skip",
  );
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <code className="min-w-0 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
        {shown && secret ? secret.secret : "whsec_••••••••••••••••"}
      </code>
      {shown && secret ? (
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            navigator.clipboard.writeText(secret.secret).then(() => toast.success(t("copied")))
          }
        >
          <Copy />
          {t("copy")}
        </Button>
      ) : (
        <Button variant="ghost" size="xs" onClick={() => setShown(true)}>
          <Eye />
          {t("reveal")}
        </Button>
      )}
    </div>
  );
}

function RecentDeliveries({
  organisationSlug,
  integrationId,
}: {
  organisationSlug: string;
  integrationId: Id<"integrations">;
}) {
  const t = useTranslations("appIntegrations");
  const deliveries = useQuery(api.deliveries.forIntegration, { organisationSlug, integrationId });
  if (deliveries === undefined || deliveries.length === 0) {
    return <p className="text-muted-foreground">{t("nothingSent")}</p>;
  }
  return (
    <div className="overflow-hidden rounded-md border">
      {deliveries.map((delivery) => (
        <DeliveryRow
          key={delivery.id}
          delivery={delivery}
          title={
            <Link
              href={`/app/o/${organisationSlug}/documents/${delivery.document.id}`}
              className="hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {delivery.document.filename}
            </Link>
          }
          actions={<ResendButton organisationSlug={organisationSlug} delivery={delivery} />}
        />
      ))}
    </div>
  );
}

/** The Organisation's Integrations, the Forms each is attached to, and a test-send. */
export function IntegrationsList({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("appIntegrations");
  const errorText = useErrorText();
  const failed = (error: unknown) => toast.error(errorText(error, t("tryAgain")));
  const integrations = useQuery(api.integrations.list, { organisationSlug });
  const forms = useQuery(api.forms.list, { organisationSlug });
  const attach = useMutation(api.integrations.attach);
  const detach = useMutation(api.integrations.detach);
  const remove = useMutation(api.integrations.remove);

  const newButton = (
    <Button>
      <Plus />
      {t("new")}
    </Button>
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <IntegrationDialog organisationSlug={organisationSlug} trigger={newButton} />
      </div>

      {integrations === undefined || forms === undefined ? (
        <Skeleton className="h-40" />
      ) : integrations.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plug />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <IntegrationDialog organisationSlug={organisationSlug} trigger={newButton} />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {integrations.map((integration) => {
            const unattached = forms
              .filter((f) => !integration.forms.some((a) => a.id === f.id))
              .map((f) => ({ value: f.id, label: f.name }));
            return (
              <Card key={integration.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {integration.name}
                    {integration.subscription && (
                      <Badge variant="outline">{t("viaApi", { key: integration.subscription.apiKeyName })}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="truncate font-mono text-xs">
                    {integration.url}
                  </CardDescription>
                  <CardAction className="flex gap-1">
                    <IntegrationDialog
                      organisationSlug={organisationSlug}
                      integration={integration}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("edit", { name: integration.name })}>
                          <Pencil />
                        </Button>
                      }
                    />
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" aria-label={t("delete", { name: integration.name })} />
                        }
                      >
                        <Trash2 />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("deleteTitle", { name: integration.name })}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {integration.subscription
                              ? t("deleteSubscriptionDescription", { key: integration.subscription.apiKeyName })
                              : t("deleteDescription")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() =>
                              remove({ organisationSlug, integrationId: integration.id }).catch(failed)
                            }
                          >
                            {t("deleteConfirm")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 text-sm">
                  {integration.headers.length > 0 && (
                    <dl className="grid gap-1">
                      {integration.headers.map((h) => (
                        <div key={h.name} className="flex min-w-0 gap-2 font-mono text-xs">
                          <dt className="text-muted-foreground">{h.name}:</dt>
                          <dd className="truncate">{h.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <div className="flex flex-col gap-1">
                    <p className="font-medium">{t("signingSecret")}</p>
                    <p className="text-muted-foreground">
                      {t.rich("signingSecretText", {
                        format: `t=<${t("unixTime")}>,v1=<hex>`,
                        signed: "{t}.{body}",
                        code: (chunks) => <code className="font-mono">{chunks}</code>,
                      })}
                    </p>
                    <SigningSecret organisationSlug={organisationSlug} integrationId={integration.id} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="font-medium">{t("forms")}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {integration.forms.length === 0 && (
                        <span className="text-muted-foreground">{t("notAttached")}</span>
                      )}
                      {integration.forms.map((form) => (
                        <Badge key={form.id} variant="secondary" className="gap-1 pr-1">
                          {form.name}
                          <button
                            type="button"
                            className="rounded-full p-0.5 hover:bg-foreground/10"
                            aria-label={t("detach", { form: form.name })}
                            onClick={() =>
                              detach({ organisationSlug, integrationId: integration.id, formId: form.id }).catch(
                                failed,
                              )
                            }
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                      {unattached.length > 0 && (
                        <Select
                          items={unattached}
                          value={null}
                          onValueChange={(formId) =>
                            formId &&
                            attach({
                              organisationSlug,
                              integrationId: integration.id,
                              formId: formId as Id<"forms">,
                            }).catch(failed)
                          }
                        >
                          <SelectTrigger size="sm" aria-label={t("attachLabel", { name: integration.name })}>
                            <SelectValue placeholder={t("attach")} />
                          </SelectTrigger>
                          <SelectContent>
                            {unattached.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("lockedNote")}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="font-medium">{t("recentDeliveries")}</p>
                    <RecentDeliveries
                      organisationSlug={organisationSlug}
                      integrationId={integration.id}
                    />
                  </div>
                  <div>
                    <TestSendButton
                      organisationSlug={organisationSlug}
                      integrationId={integration.id}
                      forms={forms.map((f) => ({ id: f.id, name: f.name }))}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
