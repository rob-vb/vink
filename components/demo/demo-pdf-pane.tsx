"use client";

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PAPER_WIDTH, demoPages, type DemoDocumentId } from "./demo-papers";

const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 3];

/**
 * A faithful copy of the app's PDF pane
 * (app/app/o/[slug]/documents/[documentId]/pdf-pane.tsx): page n/N and zoom,
 * one page at a time. It shows the demo's paper pages instead of a PDF,
 * because react-pdf would need real PDF files. Update both.
 */
export function DemoPdfPane({
  documentId,
  page,
  onPageChange,
  labels,
}: {
  documentId: DemoDocumentId;
  page: number;
  onPageChange: (page: number) => void;
  labels: { previous: string; next: string; zoomIn: string; zoomOut: string };
}) {
  const pages = demoPages[documentId];
  const pageCount = pages.length;
  const [zoom, setZoom] = useState(1);
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
  const PageView = pages[Math.min(page, pageCount) - 1];
  // The same sizing as the app: the page fills the pane's width, times the zoom.
  const scale = width === undefined ? undefined : (Math.max(width - 24, 200) * zoom) / PAPER_WIDTH;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={labels.previous}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span
            key={page}
            className="min-w-14 animate-in rounded-md text-center text-sm tabular-nums duration-500 fade-in-0"
            aria-live="polite"
          >
            {page} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={labels.next}
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
            aria-label={labels.zoomOut}
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
            aria-label={labels.zoomIn}
            disabled={zoomIndex >= ZOOMS.length - 1}
            onClick={() => setZoom(ZOOMS[zoomIndex + 1])}
          >
            <ZoomIn />
          </Button>
        </div>
      </div>
      <div ref={frame} className="min-h-0 flex-1 overflow-auto p-3">
        {scale !== undefined && (
          <div
            key={page}
            className="mx-auto w-fit animate-in shadow-sm duration-300 fade-in-0"
            style={{ zoom: scale }}
          >
            <PageView />
          </div>
        )}
      </div>
    </div>
  );
}
