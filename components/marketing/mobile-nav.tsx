"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AccountLink, StartFreeLink } from "./cta-links";
import { LanguageSwitcher } from "./language-switcher";

export function MobileNav({
  labels,
}: {
  labels: {
    menu: string;
    openMenu: string;
    logIn: string;
    openApp: string;
    startFree: string;
    language: string;
    items: Array<{ href: string; label: string }>;
    languages: Record<Locale, string>;
  };
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="md:hidden" aria-label={labels.openMenu} />}
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="right" className="marketing w-80 max-w-[85vw] gap-0 p-0">
        <SheetTitle className="border-b px-5 py-4">{labels.menu}</SheetTitle>
        <nav aria-label={labels.menu} className="flex flex-col px-3 py-3">
          {labels.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className="rounded-md px-2 py-2.5 text-base font-medium hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
          <AccountLink
            location="mobile-nav"
            logIn={labels.logIn}
            openApp={labels.openApp}
            className="rounded-md px-2 py-2.5 text-base text-muted-foreground hover:bg-muted"
          />
        </nav>
        <div className="mt-auto flex flex-col gap-4 border-t p-5">
          <LanguageSwitcher labels={labels.languages} label={labels.language} long />
          <StartFreeLink location="mobile-nav" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
            {labels.startFree}
          </StartFreeLink>
        </div>
      </SheetContent>
    </Sheet>
  );
}
