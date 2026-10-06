// The public API's routes. Next serves them at https://vink.page/v1 (a
// rewrite in next.config.ts). Exact paths win over the `/v1/` catch-all, and
// a longer path prefix wins over a shorter one.
import type { HttpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import { listForms } from "./forms";
import { openApiDocument } from "./openapi";
import { apiError, apiJson } from "./respond";

const notFound = httpAction(async (_ctx, request) =>
  apiError(404, "not_found", `There's no ${request.method} ${new URL(request.url).pathname}.`),
);

export function registerPublicApi(http: HttpRouter) {
  http.route({
    path: "/v1/openapi.json",
    method: "GET",
    // No key: the document is public, and tools fetch it from the browser.
    handler: httpAction(async () => apiJson(openApiDocument, 200, { "Access-Control-Allow-Origin": "*" })),
  });

  http.route({ path: "/v1/forms", method: "GET", handler: listForms });

  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
    http.route({ pathPrefix: "/v1/", method, handler: notFound });
  }
}
