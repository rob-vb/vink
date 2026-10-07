import { useLocale } from "next-intl";
import { demoVideo } from "@/components/marketing/demo-video";
import { BrowserFrame } from "./browser-frame";

/** The 30-second film, the same as on Home, in the page's language. */
export function FeatureVideo({ label, caption }: { label: string; caption: string }) {
  const video = demoVideo(useLocale());
  return (
    <figure className="m-0">
      <BrowserFrame path="/app/o/k7x2p9qm">
        <video
          className="block aspect-video w-full bg-background"
          controls
          playsInline
          preload="none"
          poster={video.poster}
          aria-label={label}
        >
          <source src={video.src} type="video/mp4" />
        </video>
      </BrowserFrame>
      <figcaption className="mt-4 text-center text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
