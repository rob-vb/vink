"use client";

import { useQuery } from "convex/react";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";

export function FormsList({ organisationSlug }: { organisationSlug: string }) {
  const router = useRouter();
  const forms = useQuery(api.forms.list, { organisationSlug });
  const proposals = useQuery(api.formProposals.list, { organisationSlug });
  const newForm = (
    <Button nativeButton={false} render={<Link href={`/app/o/${organisationSlug}/forms/new`} />}>
      <Plus />
      New Form
    </Button>
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Forms</h1>
          <p className="text-sm text-muted-foreground">
            One Form per kind of document. Each save keeps the earlier versions.
          </p>
        </div>
        {forms && forms.length > 0 && newForm}
      </div>

      {proposals && proposals.length > 0 && (
        <section aria-labelledby="proposals" className="mb-6 rounded-lg border p-4">
          <h2 id="proposals" className="mb-2 text-sm font-medium">
            Proposals from sample PDFs
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {proposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/o/${organisationSlug}/forms/proposals/${p.id}`}
                  className="font-medium hover:underline"
                >
                  {p.filename}
                </Link>
                <Badge variant={p.state === "failed" ? "destructive" : "secondary"}>
                  {p.state === "ready"
                    ? "Ready to review"
                    : p.state === "failed"
                      ? "Failed"
                      : "Being read"}
                </Badge>
                {p.formId && <span className="text-muted-foreground">new Fields for a Form</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            An unsaved proposal is deleted after 7 days, with its PDF.
          </p>
        </section>
      )}

      {forms === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : forms.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>No Forms yet</EmptyTitle>
            <EmptyDescription>
              A Form lists the Fields Vink fills from a kind of document,
              such as a tyre service report or an invoice.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{newForm}</EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Fields</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Version</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Review Threshold
                </TableHead>
                <TableHead className="hidden sm:table-cell">Auto-Send</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((form) => {
                const href = `/app/o/${organisationSlug}/forms/${form.id}`;
                return (
                  <TableRow
                    key={form.id}
                    className="cursor-pointer"
                    onClick={() => router.push(href)}
                  >
                    <TableCell className="max-w-0 w-full">
                      <Link href={href} className="font-medium hover:underline">
                        {form.name}
                      </Link>
                      {form.description && (
                        <p className="truncate text-muted-foreground">
                          {form.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {form.fieldCount}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      v{form.version}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {form.reviewThreshold.toFixed(2)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {form.autoSend ? (
                        <Badge>On</Badge>
                      ) : (
                        <Badge variant="outline">Off</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
