"use client";

import { useMutation, useQuery } from "convex/react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import { cn } from "cn";

// Convex stores a notification's text in English; this is the one kind there is.
const deliveryFailed = /^(.*) couldn't be delivered to (.*)$/s;

/** Admins' in-app notifications, such as a Delivery that failed. */
export function Notifications({ organisationSlug }: { organisationSlug: string }) {
  const unread = useQuery(api.notifications.unreadCount, { organisationSlug });
  const notifications = useQuery(api.notifications.list, { organisationSlug });
  const markAllRead = useMutation(api.notifications.markAllRead);
  const t = useTranslations("app.notifications");
  const locale = useLocale();
  const when = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function text(english: string) {
    const match = english.match(deliveryFailed);
    if (!match) return english;
    const [, document, integration] = match;
    return t("deliveryFailed", {
      // "A Document" is the fallback stored in older notifications, "A Submission" in newer ones.
      document: document === "A Document" || document === "A Submission" ? t("aDocument") : document,
      integration,
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={t("label", { unread: unread ?? 0 })}
          />
        }
      >
        <Bell />
        {unread ? (
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white tabular-nums">
            {unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">{t("title")}</p>
          {unread ? (
            <Button variant="ghost" size="xs" onClick={() => markAllRead({ organisationSlug })}>
              {t("markAllRead")}
            </Button>
          ) : null}
        </div>
        {notifications === undefined || notifications.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="max-h-80 overflow-auto">
            {notifications.map((n) => (
              <li key={n.id} className="border-b last:border-b-0">
                <Link
                  href={n.documentId ? `/app/o/${organisationSlug}/documents/${n.documentId}` : "#"}
                  className="flex gap-2 px-3 py-2 text-sm hover:bg-muted"
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.read ? "bg-transparent" : "bg-destructive",
                    )}
                  />
                  <span>
                    <span className={cn(!n.read && "font-medium")}>{text(n.text)}</span>
                    <span className="block text-xs text-muted-foreground">{when.format(n.at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
