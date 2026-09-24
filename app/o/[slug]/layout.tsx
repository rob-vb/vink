import Link from "next/link";
import { Logo } from "@/components/logo";
import { getOrganisation } from "./organisation";
import { OrganisationSwitcher } from "./organisation-switcher";
import { Notifications } from "./notifications";
import { UserMenu } from "./user-menu";

export default async function OrganisationLayout({
  children,
  params,
}: LayoutProps<"/o/[slug]">) {
  const { slug } = await params;
  const organisation = await getOrganisation(slug);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-3 border-b px-4 md:px-6">
        <div className="flex h-14 min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <Link href={`/o/${slug}`} aria-label="Home">
            <Logo />
          </Link>
          <span className="text-muted-foreground">/</span>
          <OrganisationSwitcher slug={slug} name={organisation.name} />
        </div>
        <nav className="order-last -mx-4 flex h-10 w-[calc(100%+2rem)] items-center gap-4 border-t px-4 text-sm sm:order-none sm:mx-0 sm:h-14 sm:w-auto sm:flex-1 sm:border-t-0 sm:px-2">
          <Link
            href={`/o/${slug}`}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Documents
          </Link>
          {organisation.role === "admin" && (
            <>
              <Link
                href={`/o/${slug}/forms`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Forms
              </Link>
              <Link
                href={`/o/${slug}/integrations`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Integrations
              </Link>
              <Link
                href={`/o/${slug}/members`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Members
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-1">
          {organisation.role === "admin" && <Notifications organisationSlug={slug} />}
          <UserMenu />
        </div>
      </header>
      {children}
    </div>
  );
}
