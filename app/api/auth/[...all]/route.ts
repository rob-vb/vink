import { handler } from "@/lib/auth-server";
import { withProxyHeaders } from "@/lib/proxy";

// Better Auth runs on Convex; this forwards to it with the visitor's IP, for
// its per-IP rate limits.
export const GET = (request: Request) => handler.GET(withProxyHeaders(request));
export const POST = (request: Request) => handler.POST(withProxyHeaders(request));
