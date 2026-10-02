"use client";

import { FilePlus2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("appForms.new");
  const [blank, setBlank] = useState(startBlank);
  if (blank) {
    return (
      <FormEditor organisationSlug={organisationSlug} initial={{ name: "", description: "", fields: [] }} />
    );
  }
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <h1 className="mb-1 text-xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t("description")}</p>
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              {t("fromSample")}
            </CardTitle>
            <CardDescription>{t("fromSampleDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SampleUpload organisationSlug={organisationSlug} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FilePlus2 className="size-4" />
              {t("blank")}
            </CardTitle>
            <CardDescription>{t("blankDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setBlank(true)}>
              {t("startBlank")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
