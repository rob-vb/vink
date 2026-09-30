import { existsSync } from "node:fs";
import path from "node:path";
import { demoPages } from "@/components/demo/demo-papers";
import { BrowserFrame } from "./browser-frame";
import { ScaledStill } from "./scaled-still";

const VIDEO = "/video/vink-15s.mp4";
const POSTER = "/video/vink-15s-poster.jpg";

const has = (file: string) => existsSync(path.join(process.cwd(), "public", file));

/**
 * The 15-second video, the same as on Home: one PDF in, clean data out.
 *
 * TODO(Rob): record it and add public/video/vink-15s.mp4 plus a poster at
 * public/video/vink-15s-poster.jpg. Until the video exists (checked when the
 * page is built), a still of a paper document next to its read values stands in.
 */
export function FeatureVideo({ label, caption }: { label: string; caption: string }) {
  const Page = demoPages.delivery[0];
  return (
    <figure className="m-0">
      <BrowserFrame path="/app/o/kantoor-noord">
        {has(VIDEO) ? (
          <video
            className="block aspect-video w-full bg-background"
            controls
            playsInline
            preload="none"
            poster={has(POSTER) ? POSTER : undefined}
            aria-label={label}
          >
            <source src={VIDEO} type="video/mp4" />
          </video>
        ) : (
          <ScaledStill width={1000} always label={label} className="aspect-video bg-[#F5F7FA]">
            <div className="grid h-[562px] grid-cols-[5fr_6fr] items-center gap-10 px-16">
              <div className="flex justify-center" style={{ zoom: 0.85 }}>
                <Page />
              </div>
              <div className="flex flex-col gap-3">
                {[0.94, 0.91, 0.88, 0.71, 0.84, 0.58].map((confidence, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-4 rounded-lg border px-4 py-3.5 ${confidence < 0.8 ? "border-amber-200 bg-amber-50" : "bg-background"}`}
                  >
                    <div className="h-2.5 w-1/4 rounded bg-[#D5DAE1]" />
                    <div className="h-2.5 w-1/3 rounded bg-[#E4E8ED]" />
                    <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                      {confidence.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ScaledStill>
        )}
      </BrowserFrame>
      <figcaption className="mt-4 text-center text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
