"use client";

import { FilePlus2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormEditor } from "../form-editor";
import { SampleUpload } from "../sample-upload";

/** "New Form": from a sample PDF (the usual way) or blank. */
export function NewForm({
  organisationSlug,
  startBlank,
}: {
  organisationSlug: string;
  startBlank: boolean;
}) {
  const [blank, setBlank] = useState(startBlank);
  if (blank) {
    return (
      <FormEditor organisationSlug={organisationSlug} initial={{ name: "", description: "", fields: [] }} />
    );
  }
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <h1 className="mb-1 text-xl font-semibold">New Form</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        One Form per kind of document you receive: a tyre report, a work order, an invoice.
      </p>
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              From a sample PDF
            </CardTitle>
            <CardDescription>
              DocuHelper reads one example and proposes the Fields. You untick what you don&apos;t
              need and adjust the rest.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SampleUpload organisationSlug={organisationSlug} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FilePlus2 className="size-4" />
              Blank
            </CardTitle>
            <CardDescription>Add every Field yourself.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setBlank(true)}>
              Start blank
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
