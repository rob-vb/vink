"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { PagesCard } from "./pages-card";

function failed(error: unknown) {
  toast.error(error instanceof ConvexError ? String(error.data) : "That didn't save. Try again.");
}

function Settings({
  organisationSlug,
  initial,
}: {
  organisationSlug: string;
  initial: { name: string; retentionDays: number };
}) {
  const rename = useMutation(api.organisations.rename);
  const updateRetention = useMutation(api.organisations.updateRetention);
  const [name, setName] = useState(initial.name);
  const [days, setDays] = useState(String(initial.retentionDays));

  return (
    <div className="flex flex-col gap-6">
      <PagesCard organisationSlug={organisationSlug} />

      <Card>
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              rename({ organisationSlug, name: name.trim() }).then(() => toast.success("Saved."), failed);
            }}
          >
            <Field className="min-w-60 flex-1">
              <FieldLabel htmlFor="organisation-name">Name</FieldLabel>
              <Input id="organisation-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" variant="outline" disabled={!name.trim() || name === initial.name}>
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data retention</CardTitle>
          <CardDescription>
            Vink deletes a Document&apos;s PDF, what it read and its values once they&apos;re
            no longer needed. The Document&apos;s name, dates, history and Delivery log stay.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              updateRetention({ organisationSlug, retentionDays: Number(days) }).then(
                () => toast.success("Saved. It applies from the next daily cleanup."),
                failed,
              );
            }}
          >
            <Field className="w-56">
              <FieldLabel htmlFor="retention-days">Days after sending</FieldLabel>
              <Input
                id="retention-days"
                type="number"
                min={1}
                max={3650}
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
              <FieldDescription>
                Counted from the last successful Delivery, or from Approval when nothing is sent.
              </FieldDescription>
            </Field>
            <Button type="submit" variant="outline" disabled={days === String(initial.retentionDays)}>
              Save
            </Button>
          </form>
          <div className="text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Always</p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>Documents never approved: 90 days after upload.</li>
              <li>Rejected Documents: 30 days after Reject. They can&apos;t be reopened after that.</li>
              <li>Unsaved Form Proposals: 7 days, with their sample PDF.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Organisation settings: its name, and how long Document data is kept. */
export function OrganisationSettings({ organisationSlug }: { organisationSlug: string }) {
  const settings = useQuery(api.organisations.settings, { organisationSlug });
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <h1 className="mb-6 text-xl font-semibold">Settings</h1>
      {settings === undefined ? (
        <Skeleton className="h-64" />
      ) : (
        <Settings organisationSlug={organisationSlug} initial={settings} />
      )}
    </main>
  );
}
