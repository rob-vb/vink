"use client";

import { useMemo, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { submissionsFormats, SubmissionsLabelsProvider, englishLabels } from "@/components/submissions/labels";
import { dutchLabels } from "@/components/submissions/nl-labels";

/**
 * The Submissions page and review screen in the app's language. Dates follow the
 * language, in the browser's own time zone.
 */
export function AppLabelsProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const format = useMemo(() => submissionsFormats(locale === "nl" ? "nl-NL" : "en-GB"), [locale]);
  return (
    <SubmissionsLabelsProvider labels={locale === "nl" ? dutchLabels : englishLabels} format={format}>
      {children}
    </SubmissionsLabelsProvider>
  );
}
