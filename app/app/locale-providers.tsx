"use client";

import { useMemo, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { documentsFormats, DocumentsLabelsProvider, englishLabels } from "@/components/documents/labels";
import { dutchLabels } from "@/components/documents/nl-labels";

/**
 * The Documents page and review screen in the app's language. Dates follow the
 * language, in the browser's own time zone.
 */
export function AppLabelsProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const format = useMemo(() => documentsFormats(locale === "nl" ? "nl-NL" : "en-GB"), [locale]);
  return (
    <DocumentsLabelsProvider labels={locale === "nl" ? dutchLabels : englishLabels} format={format}>
      {children}
    </DocumentsLabelsProvider>
  );
}
