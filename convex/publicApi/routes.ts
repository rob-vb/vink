// Every /v1 route. A resource keeps its routes in its own module (forms.ts)
// and adds them here; paths use `{name}` for parameters (router.ts).
import { formsRoutes } from "./forms";
import { openApiDocument } from "./openapi";
import { apiJson } from "./respond";
import { type ApiRoute, publicRoute } from "./router";
import { subscriptionsRoutes } from "./subscriptions";

export const routes: ApiRoute[] = [
  // No key: the document is public, and tools fetch it from the browser.
  publicRoute("GET", "/v1/openapi.json", async () =>
    apiJson(openApiDocument, 200, { "Access-Control-Allow-Origin": "*" }),
  ),
  ...formsRoutes,
  ...subscriptionsRoutes,
];
