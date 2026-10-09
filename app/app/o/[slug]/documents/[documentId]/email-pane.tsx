"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { EmailPaneView, type EmailData } from "@/components/documents/email-pane-view";
import { ImagePaneView } from "@/components/documents/image-pane-view";
import { useDocumentsLabels } from "@/components/documents/labels";
import { attachmentKind } from "@/components/documents/review-panes";
import { Skeleton } from "@/components/ui/skeleton";

// pdf.js needs the browser.
const PdfPane = dynamic(() => import("./pdf-pane"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-96 w-full" />,
});

/** The stored email (convex/lib/readerInput.ts StoredEmail), checked by hand: it is read in the browser. */
function parseEmail(json: unknown): EmailData | null {
  const email = json as Record<string, unknown> | null;
  if (typeof email !== "object" || email === null || !Array.isArray(email.attachments)) return null;
  const { subject, from, date, body } = email;
  if (![subject, from, date, body].every((v) => typeof v === "string")) return null;
  const attachments: EmailData["attachments"] = [];
  for (const a of email.attachments as Array<Record<string, unknown> | null>) {
    if (typeof a?.filename !== "string" || typeof a.mimeType !== "string") return null;
    attachments.push({
      filename: a.filename,
      mimeType: a.mimeType,
      ...(typeof a.pageCount === "number" ? { pageCount: a.pageCount } : {}),
    });
  }
  return { subject, from, date, body, attachments } as EmailData;
}

/**
 * The review screen's pane for an email Document: headers, body with the
 * source text marked, and its attachments, which open in the PDF pane or the
 * image pane. The look is `EmailPaneView`, which the marketing demo shares.
 */
export default function EmailPane({
  url,
  page,
  onPageChange,
  highlight,
  attachmentUrl,
}: {
  /** A signed URL of the stored email file. */
  url: string;
  page: number;
  onPageChange: (page: number) => void;
  highlight: string | null;
  /** A signed URL of one attachment, by its place in the email. */
  attachmentUrl: (index: number) => Promise<string>;
}) {
  const { labels } = useDocumentsLabels();
  const [email, setEmail] = useState<EmailData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    fetch(url)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((json: unknown) => {
        const parsed = parseEmail(json);
        if (!current) return;
        if (parsed === null) setFailed(true);
        else setEmail(parsed);
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [url]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {labels.panes.email.failed}
      </div>
    );
  }
  if (email === null) return <Skeleton className="h-full" />;

  return (
    <EmailPaneView
      email={email}
      page={page}
      onPageChange={onPageChange}
      highlight={highlight}
      className="h-full"
      renderAttachment={(index, localPage, onLocalPage) => (
        <Attachment
          key={index}
          attachment={email.attachments[index]}
          index={index}
          page={localPage}
          onPageChange={onLocalPage}
          attachmentUrl={attachmentUrl}
        />
      )}
    />
  );
}

function Attachment({
  attachment,
  index,
  page,
  onPageChange,
  attachmentUrl,
}: {
  attachment: EmailData["attachments"][number];
  index: number;
  page: number;
  onPageChange: (page: number) => void;
  attachmentUrl: (index: number) => Promise<string>;
}) {
  const { labels } = useDocumentsLabels();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    attachmentUrl(index).then(
      (next) => current && setUrl(next),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [attachmentUrl, index]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {labels.panes.email.attachmentFailed}
      </div>
    );
  }
  if (url === null) return <Skeleton className="h-full" />;
  if (attachmentKind(attachment) === "pdf") {
    return (
      <PdfPane url={url} pageCount={attachment.pageCount ?? 1} page={page} onPageChange={onPageChange} />
    );
  }
  return <ImagePaneView url={url} filename={attachment.filename} mimeType={attachment.mimeType} />;
}
