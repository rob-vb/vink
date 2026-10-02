"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { rememberLocale } from "@/i18n/remember";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** Keeps the choice in NEXT_LOCALE and renders the page again in that language. */
function useSwitchLocale() {
  const router = useRouter();
  return (locale: Locale) => {
    rememberLocale(locale);
    router.refresh();
  };
}

/** A submenu of the user menu. */
export function LanguageMenu() {
  const t = useTranslations("app.language");
  const current = useLocale();
  const switchLocale = useSwitchLocale();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Languages />
        {t("label")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => isLocale(value) && switchLocale(value)}
        >
          {routing.locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale} lang={locale}>
              {t(locale)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** NL · EN, for the pages outside an Organisation (sign-in, sign-up, invitations). */
export function LanguageToggle({ className }: { className?: string }) {
  const t = useTranslations("app.language");
  const current = useLocale();
  const switchLocale = useSwitchLocale();
  return (
    <nav aria-label={t("label")} className={cn("flex items-center gap-1 text-sm", className)}>
      {routing.locales.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            title={t(locale)}
            aria-pressed={active}
            onClick={() => !active && switchLocale(locale)}
            className={cn(
              "rounded-md px-1.5 py-1 transition-colors",
              active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {locale.toUpperCase()}
          </button>
        );
      })}
    </nav>
  );
}
