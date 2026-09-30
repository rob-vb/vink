import { absoluteUrl, SECURITY_EMAIL } from "@/lib/site";

// RFC 9116 security.txt, from config so it survives the domain move.
export const dynamic = "force-static";

export function GET() {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const body = [
    `Contact: mailto:${SECURITY_EMAIL}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en, nl",
    `Canonical: ${absoluteUrl("/.well-known/security.txt")}`,
    `Policy: ${absoluteUrl("/security#report")}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
