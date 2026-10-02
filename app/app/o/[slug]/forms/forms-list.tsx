"use client";

import { useQuery } from "convex/react";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
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
  const t = useTranslations("appForms.list");
  const format = useFormatter();
  const router = useRouter();
  const forms = useQuery(api.forms.list, { organisationSlug });
  const proposals = useQuery(api.formProposals.list, { organisationSlug });
  const newForm = (
    <Button nativeButton={false} render={<Link href={`/app/o/${organisationSlug}/forms/new`} />}>
      <Plus />
      {t("newForm")}
    </Button>
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {forms && forms.length > 0 && newForm}
      </div>

      {proposals && proposals.length > 0 && (
        <section aria-labelledby="proposals" className="mb-6 rounded-lg border p-4">
          <h2 id="proposals" className="mb-2 text-sm font-medium">
            {t("proposals")}
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
                  {t(
                    p.state === "ready"
                      ? "states.ready"
                      : p.state === "failed"
                        ? "states.failed"
                        : "states.reading",
                  )}
                </Badge>
                {p.formId && <span className="text-muted-foreground">{t("newFieldsForForm")}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("proposalsDeleted")}
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
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{newForm}</EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead className="text-right">{t("fields")}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{t("version")}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  {t("reviewThreshold")}
                </TableHead>
                <TableHead className="hidden sm:table-cell">{t("autoSend")}</TableHead>
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
                      {format.number(form.reviewThreshold, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {form.autoSend ? (
                        <Badge>{t("on")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("off")}</Badge>
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
