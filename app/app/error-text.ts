"use client";

import { useCallback } from "react";
import { ConvexError } from "convex/values";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { serverErrorText } from "@/lib/server-errors";

/**
 * What to show for a failed Convex call: the server's own message in the
 * app's language, or `fallback` (already translated) for anything else.
 */
export function useErrorText() {
  const locale = useLocale() as Locale;
  return useCallback(
    (error: unknown, fallback: string) =>
      error instanceof ConvexError && typeof error.data === "string"
        ? serverErrorText(error.data, locale)
        : fallback,
    [locale],
  );
}
