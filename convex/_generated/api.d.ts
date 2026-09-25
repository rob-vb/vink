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
import type * as changeForm from "../changeForm.js";
import type * as crons from "../crons.js";
import type * as deliveries from "../deliveries.js";
import type * as documents from "../documents.js";
import type * as email from "../email.js";
import type * as extraction from "../extraction.js";
import type * as extractionRun from "../extractionRun.js";
import type * as formProposals from "../formProposals.js";
import type * as forms from "../forms.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as invitations from "../invitations.js";
import type * as lib_backoff from "../lib/backoff.js";
import type * as lib_confidence from "../lib/confidence.js";
import type * as lib_documentPayload from "../lib/documentPayload.js";
import type * as lib_documentStates from "../lib/documentStates.js";
import type * as lib_extract from "../lib/extract.js";
import type * as lib_fieldKeys from "../lib/fieldKeys.js";
import type * as lib_fieldTypes from "../lib/fieldTypes.js";
import type * as lib_filler from "../lib/filler.js";
import type * as lib_fit from "../lib/fit.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_matchPlan from "../lib/matchPlan.js";
import type * as lib_matcher from "../lib/matcher.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_payload from "../lib/payload.js";
import type * as lib_pdfStore from "../lib/pdfStore.js";
import type * as lib_pipeline from "../lib/pipeline.js";
import type * as lib_proposer from "../lib/proposer.js";
import type * as lib_reader from "../lib/reader.js";
import type * as lib_reading from "../lib/reading.js";
import type * as lib_reviewState from "../lib/reviewState.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as lib_signing from "../lib/signing.js";
import type * as lib_usage from "../lib/usage.js";
import type * as lib_verifier from "../lib/verifier.js";
import type * as memberships from "../memberships.js";
import type * as notifications from "../notifications.js";
import type * as onboarding from "../onboarding.js";
import type * as organisations from "../organisations.js";
import type * as proposalRun from "../proposalRun.js";
import type * as rejection from "../rejection.js";
import type * as retention from "../retention.js";
import type * as review from "../review.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  changeForm: typeof changeForm;
  crons: typeof crons;
  deliveries: typeof deliveries;
  documents: typeof documents;
  email: typeof email;
  extraction: typeof extraction;
  extractionRun: typeof extractionRun;
  formProposals: typeof formProposals;
  forms: typeof forms;
  http: typeof http;
  integrations: typeof integrations;
  invitations: typeof invitations;
  "lib/backoff": typeof lib_backoff;
  "lib/confidence": typeof lib_confidence;
  "lib/documentPayload": typeof lib_documentPayload;
  "lib/documentStates": typeof lib_documentStates;
  "lib/extract": typeof lib_extract;
  "lib/fieldKeys": typeof lib_fieldKeys;
  "lib/fieldTypes": typeof lib_fieldTypes;
  "lib/filler": typeof lib_filler;
  "lib/fit": typeof lib_fit;
  "lib/functions": typeof lib_functions;
  "lib/http": typeof lib_http;
  "lib/matchPlan": typeof lib_matchPlan;
  "lib/matcher": typeof lib_matcher;
  "lib/models": typeof lib_models;
  "lib/payload": typeof lib_payload;
  "lib/pdfStore": typeof lib_pdfStore;
  "lib/pipeline": typeof lib_pipeline;
  "lib/proposer": typeof lib_proposer;
  "lib/reader": typeof lib_reader;
  "lib/reading": typeof lib_reading;
  "lib/reviewState": typeof lib_reviewState;
  "lib/secrets": typeof lib_secrets;
  "lib/signing": typeof lib_signing;
  "lib/usage": typeof lib_usage;
  "lib/verifier": typeof lib_verifier;
  memberships: typeof memberships;
  notifications: typeof notifications;
  onboarding: typeof onboarding;
  organisations: typeof organisations;
  proposalRun: typeof proposalRun;
  rejection: typeof rejection;
  retention: typeof retention;
  review: typeof review;
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
  extractionPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"extractionPool">;
};
