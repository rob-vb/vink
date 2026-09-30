// The consent log (ticket 05, Google's EU User Consent Policy): each choice
// from the cookie banner is written as one JSON line to the server log. It
// holds a random consent id, the banner version, the choice, the time and the
// locale. No IP address and nothing else about the visitor.

const MAX_BODY = 1000;

export async function POST(request: Request) {
  const text = (await request.text()).slice(0, MAX_BODY);
  let entry: unknown;
  try {
    entry = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const { v, id, analytics, ts, locale } = (entry ?? {}) as Record<string, unknown>;
  if (typeof id !== "string" || typeof analytics !== "boolean" || typeof v !== "number") {
    return new Response(null, { status: 400 });
  }
  console.log(
    JSON.stringify({
      type: "consent",
      id: id.slice(0, 64),
      version: v,
      analytics,
      choiceAt: typeof ts === "string" ? ts.slice(0, 40) : null,
      locale: locale === "nl" ? "nl" : "en",
      loggedAt: new Date().toISOString(),
    }),
  );
  return new Response(null, { status: 204 });
}
