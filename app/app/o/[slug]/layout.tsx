import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { getOrganisation } from "./organisation";
import { OrganisationSwitcher } from "./organisation-switcher";
import { NavLinks } from "./nav-links";
import { Notifications } from "./notifications";
import { UserMenu } from "./user-menu";

// The header is mirrored in components/demo/demo-app-frame.tsx (the marketing
// demo's app frame): update both.
export default async function OrganisationLayout({
  children,
  params,
}: LayoutProps<"/app/o/[slug]">) {
  const { slug } = await params;
  const [organisation, t] = await Promise.all([getOrganisation(slug), getTranslations("app.shell")]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-3 border-b px-4 md:px-6">
        <div className="flex h-14 min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <Link href={`/app/o/${slug}`} aria-label={t("home")} className="shrink-0">
            <Logo />
          </Link>
          <span className="shrink-0 text-muted-foreground">/</span>
          <OrganisationSwitcher slug={slug} name={organisation.name} />
        </div>
        <nav className="order-last -mx-4 flex h-10 w-[calc(100%+2rem)] items-center gap-4 overflow-x-auto border-t px-4 text-sm whitespace-nowrap [scrollbar-width:none] sm:order-none sm:mx-0 sm:h-14 sm:w-auto sm:flex-1 sm:border-t-0 sm:px-2">
          <NavLinks slug={slug} isAdmin={organisation.role === "admin"} />
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          {organisation.role === "admin" && <Notifications organisationSlug={slug} />}
          <UserMenu organisationSlug={slug} isAdmin={organisation.role === "admin"} />
        </div>
      </header>
      {children}
    </div>
  );
}
