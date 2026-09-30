import { proxyHeaders } from "@/lib/proxy";

// The contact and integration-service form posts here. The logic (honeypot,
// rate limit, email check, sending) lives in the Convex HTTP action
// `/contact` (convex/contact.ts); this passes the request on with the
// visitor's IP.
//
// Request: { kind: "contact" | "integration", name, email, company?, system?,
//   documents?, pagesPerMonth?, message?, website? (honeypot), locale? }
// Answers: 200 {"ok":true} · 400 {"error":"invalid_email" | "invalid"} ·
//   429 {"error":"rate_limited"}

// Far more than a filled-in form; anything bigger isn't one.
const MAX_BYTES = 32 * 1024;

function json(status: number, body: object) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > MAX_BYTES) return json(400, { error: "invalid" });
  try {
    const answer = await fetch(`${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proxyHeaders(request) },
      body,
    });
    return new Response(await answer.text(), {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return json(502, { error: "unavailable" });
  }
}
