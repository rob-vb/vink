// How every /v1 endpoint answers: JSON, snake_case keys (ADR 0005), and one
// error shape: { "error": { "code": "snake_case_code", "message": "…" } }.
// Codes are listed in openapi/common.ts so the reference shows them all.

export function apiJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function apiError(status: number, code: string, message: string) {
  return apiJson({ error: { code, message } }, status);
}
