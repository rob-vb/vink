/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as documents from "../documents.js";
import type * as email from "../email.js";
import type * as forms from "../forms.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as lib_fieldKeys from "../lib/fieldKeys.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_pdfStore from "../lib/pdfStore.js";
import type * as memberships from "../memberships.js";
import type * as onboarding from "../onboarding.js";
import type * as organisations from "../organisations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  documents: typeof documents;
  email: typeof email;
  forms: typeof forms;
  http: typeof http;
  invitations: typeof invitations;
  "lib/fieldKeys": typeof lib_fieldKeys;
  "lib/functions": typeof lib_functions;
  "lib/pdfStore": typeof lib_pdfStore;
  memberships: typeof memberships;
  onboarding: typeof onboarding;
  organisations: typeof organisations;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};
