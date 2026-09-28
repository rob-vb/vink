"use client";

import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { DocumentTable } from "../document-table";

/** The Documents DocuHelper is reading right now. Each leaves the list when its Extraction ends. */
export function ExtractingList({ organisationSlug }: { organisationSlug: string }) {
  const list = useQuery(api.documents.list, { organisationSlug, state: "extracting" });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          nativeButton={false}
          render={<Link href={`/o/${organisationSlug}`} />}
        >
          <ArrowLeft />
          Documents
        </Button>
        <h1 className="text-xl font-semibold">Extracting</h1>
        <p className="text-sm text-muted-foreground">
          DocuHelper is reading these now. Each moves to Needs Review or Approved when it is
          done, or to Failed.
        </p>
      </div>
      <DocumentTable
        organisationSlug={organisationSlug}
        documents={list?.documents}
        empty="Nothing is being read right now."
      />
    </main>
  );
}
