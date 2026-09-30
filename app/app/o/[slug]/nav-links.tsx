"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

/** The top nav's links; the one for the current section is marked active. */
export function NavLinks({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const base = `/app/o/${slug}`;
  const links = [
    // Documents is the Organisation's home page.
    { href: base, label: "Documents", active: pathname === base || pathname.startsWith(`${base}/documents`) },
    ...(isAdmin
      ? [
          { href: `${base}/forms`, label: "Forms" },
          { href: `${base}/integrations`, label: "Integrations" },
          { href: `${base}/members`, label: "Members" },
        ].map((link) => ({
          ...link,
          active: pathname === link.href || pathname.startsWith(`${link.href}/`),
        }))
      : []),
  ];

  return links.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      aria-current={link.active ? "page" : undefined}
      className={cn(
        "relative flex h-full items-center text-muted-foreground transition-colors hover:text-foreground",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity",
        link.active && "font-medium text-foreground after:opacity-100",
      )}
    >
      {link.label}
    </Link>
  ));
}
