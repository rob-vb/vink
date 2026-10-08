"use client";

import { Download, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentsLabels } from "./labels";
import { isHeic } from "./review-panes";

// 1 is "fit to width", the default. Handwriting needs a lot of zoom.
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const STEP = 1.25;

const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));

/**
 * A photo or scan, zoomable: fit to width at first, then the buttons, Ctrl (or
 * Cmd) and the mouse wheel or a trackpad pinch, a two-finger pinch on a touch
 * screen, or the + − 0 keys when the pane has focus. A plain wheel scrolls. It
 * has no source highlighting in v1.
 *
 * Shared by the app (a signed URL) and the marketing demo (a drawn photo, as
 * `children`), so both look the same. A browser that cannot draw HEIC gets a
 * download link instead of a broken image.
 */
export function ImagePaneView({
  url,
  filename,
  mimeType,
  children,
  className = "",
}: {
  /** The photo's URL; leave out when `children` draw it (the demo). */
  url?: string;
  filename: string;
  mimeType: string;
  /** What to draw instead of an `<img>`; it is `width: 100%` of the zoomed frame. */
  children?: React.ReactNode;
  className?: string;
}) {
  const { labels } = useDocumentsLabels();
  const t = labels.panes.image;
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(children !== undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const hint = useId();

  // Ctrl+wheel and the pinch of a trackpad (which a browser sends as Ctrl+wheel) zoom; a
  // plain wheel scrolls. React's onWheel is passive, so this listener is native.
  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((z) => clamp(z * Math.exp(-event.deltaY * 0.01)));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  // A pinch on a touch screen: two pointers, the zoom follows the distance between them.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function onKeyDown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "+" || event.key === "=") setZoom((z) => clamp(z * STEP));
    else if (event.key === "-" || event.key === "_") setZoom((z) => clamp(z / STEP));
    else if (event.key === "0") setZoom(1);
    else return;
    event.preventDefault();
  }

  const showHeicFallback = isHeic(mimeType) && failed;

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/40 ${className}`}>
      <div className="flex items-center justify-end gap-1 border-b bg-background px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.zoomOut}
          disabled={zoom <= MIN_ZOOM}
          onClick={() => setZoom((z) => clamp(z / STEP))}
        >
          <ZoomOut />
        </Button>
        <span className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.zoomIn}
          disabled={zoom >= MAX_ZOOM}
          onClick={() => setZoom((z) => clamp(z * STEP))}
        >
          <ZoomIn />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t.fit} disabled={zoom === 1} onClick={() => setZoom(1)}>
          <Maximize2 />
        </Button>
      </div>
      <p id={hint} className="sr-only">
        {t.zoomHint}
      </p>
      <div
        ref={scroller}
        role="group"
        aria-label={t.zoom}
        aria-describedby={hint}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.pointerType !== "touch") return;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.current.size === 2) pinch.current = { distance: distance(), zoom };
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.current.size === 2 && pinch.current !== null && pinch.current.distance > 0) {
            setZoom(clamp((pinch.current.zoom * distance()) / pinch.current.distance));
          }
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          pinch.current = null;
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          pinch.current = null;
        }}
        // `pan-x pan-y` lets a finger scroll the zoomed photo; the two-finger pinch is ours.
        style={{ touchAction: "pan-x pan-y" }}
        className="min-h-0 flex-1 overflow-auto p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {showHeicFallback ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
            <p className="font-medium">{t.heicTitle}</p>
            <p className="text-muted-foreground">{t.heicText}</p>
            {url && (
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={url} download={filename} />}>
                <Download />
                {t.download}
              </Button>
            )}
          </div>
        ) : failed ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t.failed}</p>
        ) : (
          <div className="mx-auto shadow-sm" style={{ width: `${zoom * 100}%` }}>
            {children ?? (
              <>
                {!loaded && <Skeleton className="aspect-[3/4] w-full" />}
                {/* A short-lived signed URL: next/image would only proxy it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={t.alt(filename)}
                  draggable={false}
                  className={loaded ? "block h-auto w-full max-w-none select-none" : "hidden"}
                  onLoad={() => setLoaded(true)}
                  onError={() => setFailed(true)}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
