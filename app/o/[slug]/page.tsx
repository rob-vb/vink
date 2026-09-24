import { FileStack } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getOrganisation } from "./organisation";

export const metadata: Metadata = { title: "DocuHelper" };

export default async function OrganisationHome({ params }: PageProps<"/o/[slug]">) {
  const { slug } = await params;
  const organisation = await getOrganisation(slug);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Empty className="max-w-xl border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileStack />
          </EmptyMedia>
          <EmptyTitle>Welcome to {organisation.name}</EmptyTitle>
          <EmptyDescription>
            Set up a Form for each kind of document you receive, and DocuHelper
            will fill it from your PDFs.
          </EmptyDescription>
        </EmptyHeader>
        {organisation.role === "admin" && (
          <EmptyContent>
            <Button nativeButton={false} render={<Link href={`/o/${slug}/forms`} />}>Go to Forms</Button>
          </EmptyContent>
        )}
      </Empty>
    </main>
  );
}
