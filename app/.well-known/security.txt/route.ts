import { SITE_URL } from "@/lib/site";
import { securityTxt } from "@/lib/security-txt";

// Built once at build time; Expires is a year after the build, so every
// deploy renews it.
export const dynamic = "force-static";

export function GET() {
  return new Response(
    securityTxt({ siteUrl: SITE_URL, contact: process.env.SECURITY_CONTACT, now: new Date() }),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
