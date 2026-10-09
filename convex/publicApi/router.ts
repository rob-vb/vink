// The public API's own router. Convex's httpRouter has no path parameters, so
// http.ts sends everything under /v1/ here (one `pathPrefix` route per method)
// and this matches it against the route table in routes.ts. Next serves it at
// https://vink.page/v1 (a rewrite in next.config.ts).
import type { HttpRouter } from "convex/server";
import { type ActionCtx, httpAction } from "../_generated/server";
import { type ApiCaller, authenticate } from "./auth";
import { apiError } from "./respond";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

/** `{name}` segments of the route's path, URL-decoded. */
export type Params = Record<string, string>;

export type ApiRoute = {
  method: Method;
  // From the root, with `{name}` for a parameter: `/v1/forms/{form_id}/submissions`.
  path: string;
  run: (ctx: ActionCtx, request: Request, params: Params) => Promise<Response>;
};

/** A route for programs with an API Key; the handler gets the key's Organisation. */
export function route(
  method: Method,
  path: string,
  handler: (ctx: ActionCtx, request: Request, args: { caller: ApiCaller; params: Params }) => Promise<Response>,
): ApiRoute {
  return {
    method,
    path,
    run: async (ctx, request, params) => {
      const caller = await authenticate(ctx, request);
      if (caller instanceof Response) return caller;
      return await handler(ctx, request, { caller, params });
    },
  };
}

/** A route anyone may call, without a key. */
export function publicRoute(
  method: Method,
  path: string,
  handler: (ctx: ActionCtx, request: Request, args: { params: Params }) => Promise<Response>,
): ApiRoute {
  return { method, path, run: (ctx, request, params) => handler(ctx, request, { params }) };
}

/** The route's parameters when `pathname` matches its path, else null. */
export function matchPath(path: string, pathname: string): Params | null {
  const want = path.split("/");
  const got = pathname.replace(/\/+$/, "").split("/");
  if (want.length !== got.length) return null;
  const params: Params = {};
  for (let i = 0; i < want.length; i++) {
    const name = want[i].match(/^\{(\w+)\}$/)?.[1];
    if (name === undefined) {
      if (want[i] !== got[i]) return null;
      continue;
    }
    if (got[i] === "") return null;
    try {
      params[name] = decodeURIComponent(got[i]);
    } catch {
      return null;
    }
  }
  return params;
}

export function registerRoutes(http: HttpRouter, routes: ApiRoute[]) {
  const dispatch = httpAction(async (ctx, request) => {
    const { pathname } = new URL(request.url);
    const matching = routes.flatMap((r) => {
      const params = matchPath(r.path, pathname);
      return params === null ? [] : [{ route: r, params }];
    });
    const match = matching.find((m) => m.route.method === request.method);
    if (match === undefined) {
      return matching.length > 0
        ? apiError(405, "method_not_allowed", `${pathname} doesn't take ${request.method}.`)
        : apiError(404, "not_found", `There's no ${request.method} ${pathname}.`);
    }
    try {
      return await match.route.run(ctx, request, match.params);
    } catch (error) {
      console.error("Public API handler failed", error);
      return apiError(500, "internal_error", "Something went wrong on our side. Try again later.");
    }
  });
  for (const method of METHODS) {
    http.route({ pathPrefix: "/v1/", method, handler: dispatch });
  }
}
