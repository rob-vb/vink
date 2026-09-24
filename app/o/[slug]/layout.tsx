import Link from "next/link";
import { Logo } from "@/components/logo";
import { getOrganisation } from "./organisation";
import { UserMenu } from "./user-menu";

export default async function OrganisationLayout({
  children,
  params,
}: LayoutProps<"/o/[slug]">) {
  const { slug } = await params;
  const organisation = await getOrganisation(slug);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/o/${slug}`} aria-label="Home">
            <Logo />
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="truncate font-medium">{organisation.name}</span>
          {organisation.role === "admin" && (
            <nav className="ml-4 flex items-center gap-4 text-sm">
              <Link
                href={`/o/${slug}/forms`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Forms
              </Link>
            </nav>
          )}
        </div>
        <UserMenu />
      </header>
      {children}
    </div>
  );
}
