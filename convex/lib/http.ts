// The adapter boundary for outbound HTTP to Integrations. Tests replace it
// with a fake (see test.setup.ts).

// A receiver must answer within this long.
const TIMEOUT_MS = 15_000;

// What the Delivery log and the test-send panel keep of a response body.
const BODY_KEPT = 2000;

/** No HTTP answer at all: the receiver timed out or couldn't be reached. */
export class HttpFailure extends Error {
  constructor(readonly kind: "timeout" | "network") {
    super(kind === "timeout" ? "The receiver didn't answer within 15 s" : "The receiver couldn't be reached");
  }
}

export const http = {
  async post(url: string, headers: Record<string, string>, body: string) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new HttpFailure(
        error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network",
      );
    }
    const text = await response.text().catch(() => "");
    return {
      status: response.status,
      body: text.slice(0, BODY_KEPT),
      retryAfter: response.headers.get("retry-after"),
    };
  },
};
