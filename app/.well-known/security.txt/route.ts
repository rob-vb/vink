import { securityTxt } from "@/lib/security-txt";
import { SECURITY_EMAIL, SITE_URL } from "@/lib/site";

// Built once at build time; Expires is a year after the build, so every
// deploy renews it. The address is the same one the Security page shows.
export const dynamic = "force-static";

export function GET() {
  return new Response(securityTxt({ siteUrl: SITE_URL, contact: SECURITY_EMAIL, now: new Date() }), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
