"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { useErrorText } from "../../../error-text";
import { ApiKeysCard } from "./api-keys-card";
import { DangerZone } from "./danger-zone";
import { PagesCard } from "./pages-card";

function Settings({
  organisationSlug,
  initial,
}: {
  organisationSlug: string;
  initial: { name: string; retentionDays: number };
}) {
  const t = useTranslations("appSettings");
  const errorText = useErrorText();
  const failed = (error: unknown) => toast.error(errorText(error, t("notSaved")));
  const rename = useMutation(api.organisations.rename);
  const updateRetention = useMutation(api.organisations.updateRetention);
  const [name, setName] = useState(initial.name);
  const [days, setDays] = useState(String(initial.retentionDays));

  return (
    <div className="flex flex-col gap-6">
      <PagesCard organisationSlug={organisationSlug} />

      <Card>
        <CardHeader>
          <CardTitle>{t("organisation")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              rename({ organisationSlug, name: name.trim() }).then(() => toast.success(t("saved")), failed);
            }}
          >
            <Field className="min-w-60 flex-1">
              <FieldLabel htmlFor="organisation-name">{t("name")}</FieldLabel>
              <Input id="organisation-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" variant="outline" disabled={!name.trim() || name === initial.name}>
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("retention.title")}</CardTitle>
          <CardDescription>{t("retention.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              updateRetention({ organisationSlug, retentionDays: Number(days) }).then(
                () => toast.success(t("retention.saved")),
                failed,
              );
            }}
          >
            <Field className="w-56">
              <FieldLabel htmlFor="retention-days">{t("retention.days")}</FieldLabel>
              <Input
                id="retention-days"
                type="number"
                min={1}
                max={365}
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
              <FieldDescription>{t("retention.daysHint")}</FieldDescription>
            </Field>
            <Button type="submit" variant="outline" disabled={days === String(initial.retentionDays)}>
              {t("save")}
            </Button>
          </form>
          <div className="text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">{t("retention.always")}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>{t("retention.neverApproved")}</li>
              <li>{t("retention.rejected")}</li>
              <li>{t("retention.proposals")}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <ApiKeysCard organisationSlug={organisationSlug} />

      <DangerZone organisationSlug={organisationSlug} name={initial.name} />
    </div>
  );
}

/** Organisation settings: its name, how long Document data is kept, API Keys, and the Danger Zone. */
export function OrganisationSettings({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("appSettings");
  const settings = useQuery(api.organisations.settings, { organisationSlug });
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <h1 className="mb-6 text-xl font-semibold">{t("title")}</h1>
      {settings === undefined ? (
        <Skeleton className="h-64" />
      ) : (
        <Settings organisationSlug={organisationSlug} initial={settings} />
      )}
    </main>
  );
}
