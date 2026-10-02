"use client";

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 3];

/**
 * The PDF, one page at a time, with page n/N and zoom. Zoom matters for handwriting.
 *
 * Mirrored in components/demo/demo-pdf-pane.tsx (the marketing demo draws its
 * paper pages without react-pdf): update both.
 */
export default function PdfPane({
  url,
  pageCount,
  page,
  onPageChange,
}: {
  url: string;
  pageCount: number;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations("appDocuments.pdf");
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  useEffect(() => {
    const element = frame.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoomIndex = ZOOMS.indexOf(zoom);

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("previous")}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-14 text-center text-sm tabular-nums" aria-live="polite">
            {page} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("next")}
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("zoomOut")}
            disabled={zoomIndex <= 0}
            onClick={() => setZoom(ZOOMS[zoomIndex - 1])}
          >
            <ZoomOut />
          </Button>
          <span className="min-w-12 text-center text-sm tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("zoomIn")}
            disabled={zoomIndex >= ZOOMS.length - 1}
            onClick={() => setZoom(ZOOMS[zoomIndex + 1])}
          >
            <ZoomIn />
          </Button>
        </div>
      </div>
      <div ref={frame} className="min-h-0 flex-1 overflow-auto p-3">
        {failed ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t("failed")}</p>
        ) : (
          width !== undefined && (
            <Document
              file={url}
              loading={<Skeleton className="aspect-[1/1.414] w-full" />}
              onLoadError={() => setFailed(true)}
            >
              <Page
                pageNumber={page}
                width={Math.max(width - 24, 200) * zoom}
                className="mx-auto w-fit shadow-sm"
                loading={<Skeleton className="aspect-[1/1.414] w-full" />}
              />
            </Document>
          )
        )}
      </div>
    </div>
  );
}
