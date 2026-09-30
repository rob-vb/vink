import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// Only /api/ is disallowed. /app/ must stay crawlable so Google can see its
// noindex (X-Robots-Tag from next.config and robots in the app layout).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
