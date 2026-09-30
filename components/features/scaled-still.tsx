"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";

/**
 * Shows live app parts as a picture: laid out at `width` like a desktop
 * screen and scaled down to fit, cropped to the frame. Below `lg` the app
 * uses its mobile layout, so the still is laid out at the frame's own width
 * (at least 400px) instead, unless `always` is set. Nothing inside can be
 * clicked or focused.
 */
export function ScaledStill({
  width,
  always = false,
  fade = !always,
  label,
  className,
  children,
}: {
  width: number;
  /** Always lay out at `width` and scale, like an image. */
  always?: boolean;
  /** Fade out the cropped bottom edge. */
  fade?: boolean;
  label: string;
  /** The frame's shape, e.g. an aspect ratio. */
  className?: string;
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ layout: number; scale: number }>();

  useEffect(() => {
    const element = frame.current;
    if (element === null) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const measure = () => {
      const available = element.clientWidth;
      const layout = always || desktop.matches ? width : Math.max(400, available);
      setZoom({ layout, scale: available / layout });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    desktop.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", measure);
    };
  }, [width, always]);

  return (
    <div
      ref={frame}
      role="img"
      aria-label={label}
      className={cn("relative overflow-hidden bg-background", className)}
    >
      <div
        inert
        aria-hidden
        className={cn("pointer-events-none select-none", !zoom && "invisible")}
        style={zoom ? { width: zoom.layout, zoom: zoom.scale } : { width }}
      >
        {children}
      </div>
      {fade && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
      )}
    </div>
  );
}
