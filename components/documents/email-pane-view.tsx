"use client";

import { FileText, Image as ImageIcon, Mail, Paperclip } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDocumentsLabels } from "./labels";
import {
  attachmentKind,
  firstPageOf,
  highlightSegments,
  locatePage,
  pagesOf,
  type AttachmentInfo,
} from "./review-panes";

export type EmailData = {
  subject: string;
  from: string;
  date: string;
  body: string;
  attachments: AttachmentInfo[];
};

/**
 * An email: its headers, its attachments, and the body (or one attachment).
 * What is shown follows `page`, numbered as the Reader numbers an email's pages:
 * 1 is the headers and body, the attachments' pages follow. The text a value
 * was read from is marked in the body (`highlight` is that value's read text),
 * as the review screen turns the PDF to the page a value was read on.
 *
 * Shared by the app (an email file, its attachments through `renderAttachment`)
 * and the marketing demo (a demo email, drawn attachments).
 */
export function EmailPaneView({
  email,
  page,
  onPageChange,
  highlight,
  renderAttachment,
  className = "",
}: {
  email: EmailData;
  page: number;
  onPageChange: (page: number) => void;
  /** The read text of the selected value when it was read on the body; `null` marks nothing. */
  highlight: string | null;
  /** Draws one attachment at its own page number (1 for an image). */
  renderAttachment: (index: number, page: number, onPageChange: (page: number) => void) => ReactNode;
  className?: string;
}) {
  const { labels, format } = useDocumentsLabels();
  const t = labels.panes.email;
  const located = locatePage(email.attachments, page);
  const current = located.part === "body" ? "body" : String(located.index);
  const mark = useRef<HTMLElement>(null);
  const segments = highlightSegments(email.body, located.part === "body" ? highlight : null);
  const marked = segments.some((s) => s.mark);

  // Bring the marked text into view, like turning the PDF to the right page.
  useEffect(() => {
    if (marked) mark.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [marked, highlight]);

  const parsed = Date.parse(email.date);
  const date = Number.isNaN(parsed) ? email.date : format.dateTime(parsed);

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/40 ${className}`}>
      <div className="border-b bg-background px-4 py-3">
        <p className="text-base font-semibold break-words">{email.subject.trim() || t.noSubject}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-muted-foreground">{t.from}</dt>
          <dd className="min-w-0 break-words">{email.from}</dd>
          <dt className="text-muted-foreground">{t.date}</dt>
          <dd className="min-w-0 break-words tabular-nums">{date}</dd>
        </dl>
        {email.attachments.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="size-3.5" aria-hidden />
              {t.attachments(email.attachments.length)}
            </p>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={1}
              aria-label={t.switcher}
              className="max-w-full flex-wrap"
              value={[current]}
              onValueChange={(value) => {
                const next = value[0];
                if (next === undefined) return;
                onPageChange(next === "body" ? 1 : firstPageOf(email.attachments, Number(next)));
              }}
            >
              <ToggleGroupItem value="body" className="max-w-full">
                <Mail />
                {t.body}
              </ToggleGroupItem>
              {email.attachments.map((attachment, index) => {
                const pdf = attachmentKind(attachment) === "pdf";
                return (
                  <ToggleGroupItem
                    key={index}
                    value={String(index)}
                    aria-label={t.attachment(attachment.filename, pdf ? pagesOf(attachment) : null)}
                    className="max-w-56 min-w-0"
                  >
                    {pdf ? <FileText /> : <ImageIcon />}
                    <span className="truncate">{attachment.filename}</span>
                    {pdf && (
                      <span className="text-muted-foreground tabular-nums">{pagesOf(attachment)}</span>
                    )}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>
        )}
      </div>
      {located.part === "body" ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {email.body.trim() === "" ? (
            <p className="text-sm text-muted-foreground">{t.noBody}</p>
          ) : (
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
              {segments.map((segment, i) =>
                segment.mark ? (
                  <mark
                    key={i}
                    ref={mark}
                    className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/40"
                  >
                    {segment.text}
                  </mark>
                ) : (
                  <span key={i}>{segment.text}</span>
                ),
              )}
            </p>
          )}
          {marked && <span className="sr-only">{t.sourceFound}</span>}
        </div>
      ) : (
        // The attachment's own pane, without its own frame: this one has it.
        <div className="min-h-0 flex-1 *:h-full *:rounded-none *:border-0">
          {renderAttachment(located.index, located.page, (local) =>
            onPageChange(firstPageOf(email.attachments, located.index) + local - 1),
          )}
        </div>
      )}
    </div>
  );
}
