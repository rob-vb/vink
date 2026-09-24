import { ConvexError } from "convex/values";
import { FileStack } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { api } from "@/convex/_generated/api";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { UserMenu } from "./user-menu";

export const metadata: Metadata = { title: "DocuHelper" };

export default async function OrganisationHome({ params }: PageProps<"/o/[slug]">) {
  const { slug } = await params;
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }
  let organisation;
  try {
    organisation = await fetchAuthQuery(api.organisations.home, {
      organisationSlug: slug,
    });
  } catch (error) {
    if (error instanceof ConvexError && error.data === "Forbidden") {
      notFound();
    }
    throw error;
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{organisation.name}</span>
        </div>
        <UserMenu />
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileStack />
            </EmptyMedia>
            <EmptyTitle>Welcome to {organisation.name}</EmptyTitle>
            <EmptyDescription>
              No Forms yet. Soon you&apos;ll set up a Form here for each kind of
              document you receive, and DocuHelper will fill it from your PDFs.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    </div>
  );
}
