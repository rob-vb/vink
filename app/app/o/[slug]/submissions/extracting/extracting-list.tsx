"use client";

import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { SubmissionTable } from "../submission-table";

/** The Submissions Vink is reading right now. Each leaves the list when its Extraction ends. */
export function ExtractingList({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("appSubmissions.extracting");
  const list = useQuery(api.submissions.list, { organisationSlug, state: "extracting" });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          nativeButton={false}
          render={<Link href={`/app/o/${organisationSlug}`} />}
        >
          <ArrowLeft />
          {t("back")}
        </Button>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <SubmissionTable
        organisationSlug={organisationSlug}
        submissions={list?.submissions}
        empty={t("empty")}
      />
    </main>
  );
}
