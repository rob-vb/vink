"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Copy, Eye, Pencil, Plug, Plus, Trash2, X } from "lucide-react";
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
import { IntegrationDialog } from "./integration-dialog";
import { TestSendButton } from "./test-send";

function failed(error: unknown) {
  toast.error(error instanceof ConvexError ? String(error.data) : "That didn't work. Try again.");
}

function SigningSecret({
  organisationSlug,
  integrationId,
}: {
  organisationSlug: string;
  integrationId: Id<"integrations">;
}) {
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
            navigator.clipboard.writeText(secret.secret).then(() => toast.success("Copied."))
          }
        >
          <Copy />
          Copy
        </Button>
      ) : (
        <Button variant="ghost" size="xs" onClick={() => setShown(true)}>
          <Eye />
          Reveal
        </Button>
      )}
    </div>
  );
}

/** The Organisation's Integrations, the Forms each is attached to, and a test-send. */
export function IntegrationsList({ organisationSlug }: { organisationSlug: string }) {
  const integrations = useQuery(api.integrations.list, { organisationSlug });
  const forms = useQuery(api.forms.list, { organisationSlug });
  const attach = useMutation(api.integrations.attach);
  const detach = useMutation(api.integrations.detach);
  const remove = useMutation(api.integrations.remove);

  const newButton = (
    <Button>
      <Plus />
      New Integration
    </Button>
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Where approved Documents go. Attach an Integration to the Forms it should receive.
          </p>
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
            <EmptyTitle>No Integrations yet</EmptyTitle>
            <EmptyDescription>
              Without one, approving a Document just marks it approved. Add your system&apos;s
              endpoint to have DocuHelper send the data there.
            </EmptyDescription>
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
                  <CardTitle>{integration.name}</CardTitle>
                  <CardDescription className="truncate font-mono text-xs">
                    {integration.url}
                  </CardDescription>
                  <CardAction className="flex gap-1">
                    <IntegrationDialog
                      organisationSlug={organisationSlug}
                      integration={integration}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${integration.name}`}>
                          <Pencil />
                        </Button>
                      }
                    />
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${integration.name}`} />
                        }
                      >
                        <Trash2 />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {integration.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            It is detached from its Forms, and nothing is sent to it anymore.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() =>
                              remove({ organisationSlug, integrationId: integration.id }).catch(failed)
                            }
                          >
                            Delete
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
                    <p className="font-medium">Signing secret</p>
                    <p className="text-muted-foreground">
                      Every request carries an <code className="font-mono">X-DocuHelper-Signature</code>{" "}
                      header: HMAC-SHA256 of the body with this secret.
                    </p>
                    <SigningSecret organisationSlug={organisationSlug} integrationId={integration.id} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="font-medium">Forms</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {integration.forms.length === 0 && (
                        <span className="text-muted-foreground">Not attached to any Form yet.</span>
                      )}
                      {integration.forms.map((form) => (
                        <Badge key={form.id} variant="secondary" className="gap-1 pr-1">
                          {form.name}
                          <button
                            type="button"
                            className="rounded-full p-0.5 hover:bg-foreground/10"
                            aria-label={`Detach ${form.name}`}
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
                          <SelectTrigger size="sm" aria-label={`Attach ${integration.name} to a Form`}>
                            <SelectValue placeholder="Attach to a Form" />
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
                    <p className="text-xs text-muted-foreground">
                      An attached Form&apos;s keys are locked. Documents approved before attaching
                      aren&apos;t sent.
                    </p>
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
