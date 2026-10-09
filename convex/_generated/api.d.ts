/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as billingState from "../billingState.js";
import type * as changeForm from "../changeForm.js";
import type * as contact from "../contact.js";
import type * as crons from "../crons.js";
import type * as deletion from "../deletion.js";
import type * as deliveries from "../deliveries.js";
import type * as documents from "../documents.js";
import type * as email from "../email.js";
import type * as excel from "../excel.js";
import type * as extraction from "../extraction.js";
import type * as extractionRun from "../extractionRun.js";
import type * as formProposals from "../formProposals.js";
import type * as forms from "../forms.js";
import type * as googleSheets from "../googleSheets.js";
import type * as http from "../http.js";
import type * as intake from "../intake.js";
import type * as intakeSplit from "../intakeSplit.js";
import type * as integrations from "../integrations.js";
import type * as invitations from "../invitations.js";
import type * as items from "../items.js";
import type * as lib_accounts from "../lib/accounts.js";
import type * as lib_backoff from "../lib/backoff.js";
import type * as lib_billing from "../lib/billing.js";
import type * as lib_clientIp from "../lib/clientIp.js";
import type * as lib_confidence from "../lib/confidence.js";
import type * as lib_documentFiles from "../lib/documentFiles.js";
import type * as lib_documentForm from "../lib/documentForm.js";
import type * as lib_documentPayload from "../lib/documentPayload.js";
import type * as lib_documentStates from "../lib/documentStates.js";
import type * as lib_emailParse from "../lib/emailParse.js";
import type * as lib_eventInfo from "../lib/eventInfo.js";
import type * as lib_excelAdapter from "../lib/excelAdapter.js";
import type * as lib_extract from "../lib/extract.js";
import type * as lib_failure from "../lib/failure.js";
import type * as lib_fieldKeys from "../lib/fieldKeys.js";
import type * as lib_fieldTypes from "../lib/fieldTypes.js";
import type * as lib_filler from "../lib/filler.js";
import type * as lib_fit from "../lib/fit.js";
import type * as lib_formDescription from "../lib/formDescription.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_google from "../lib/google.js";
import type * as lib_googleSheetsAdapter from "../lib/googleSheetsAdapter.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_inputLimits from "../lib/inputLimits.js";
import type * as lib_integrationAdapters from "../lib/integrationAdapters.js";
import type * as lib_mailPlan from "../lib/mailPlan.js";
import type * as lib_matchPlan from "../lib/matchPlan.js";
import type * as lib_matcher from "../lib/matcher.js";
import type * as lib_microsoft from "../lib/microsoft.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_oauthState from "../lib/oauthState.js";
import type * as lib_payload from "../lib/payload.js";
import type * as lib_pdfStore from "../lib/pdfStore.js";
import type * as lib_pipeline from "../lib/pipeline.js";
import type * as lib_proposer from "../lib/proposer.js";
import type * as lib_readThinking from "../lib/readThinking.js";
import type * as lib_reader from "../lib/reader.js";
import type * as lib_readerInput from "../lib/readerInput.js";
import type * as lib_reading from "../lib/reading.js";
import type * as lib_reviewState from "../lib/reviewState.js";
import type * as lib_router from "../lib/router.js";
import type * as lib_routerPlan from "../lib/routerPlan.js";
import type * as lib_rows from "../lib/rows.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as lib_signUpGuard from "../lib/signUpGuard.js";
import type * as lib_signing from "../lib/signing.js";
import type * as lib_sniff from "../lib/sniff.js";
import type * as lib_splitter from "../lib/splitter.js";
import type * as lib_storedEmail from "../lib/storedEmail.js";
import type * as lib_stripe from "../lib/stripe.js";
import type * as lib_usage from "../lib/usage.js";
import type * as lib_verifier from "../lib/verifier.js";
import type * as lib_webhookAdapter from "../lib/webhookAdapter.js";
import type * as memberships from "../memberships.js";
import type * as notifications from "../notifications.js";
import type * as onboarding from "../onboarding.js";
import type * as organisations from "../organisations.js";
import type * as proposalRun from "../proposalRun.js";
import type * as publicApi_auth from "../publicApi/auth.js";
import type * as publicApi_documentRead from "../publicApi/documentRead.js";
import type * as publicApi_documents from "../publicApi/documents.js";
import type * as publicApi_forms from "../publicApi/forms.js";
import type * as publicApi_openapi_common from "../publicApi/openapi/common.js";
import type * as publicApi_openapi_documentRead from "../publicApi/openapi/documentRead.js";
import type * as publicApi_openapi_documents from "../publicApi/openapi/documents.js";
import type * as publicApi_openapi_forms from "../publicApi/openapi/forms.js";
import type * as publicApi_openapi_index from "../publicApi/openapi/index.js";
import type * as publicApi_openapi_subscriptions from "../publicApi/openapi/subscriptions.js";
import type * as publicApi_openapi_types from "../publicApi/openapi/types.js";
import type * as publicApi_respond from "../publicApi/respond.js";
import type * as publicApi_router from "../publicApi/router.js";
import type * as publicApi_routes from "../publicApi/routes.js";
import type * as publicApi_subscriptions from "../publicApi/subscriptions.js";
import type * as rejection from "../rejection.js";
import type * as retention from "../retention.js";
import type * as review from "../review.js";
import type * as subscriptions from "../subscriptions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  billing: typeof billing;
  billingState: typeof billingState;
  changeForm: typeof changeForm;
  contact: typeof contact;
  crons: typeof crons;
  deletion: typeof deletion;
  deliveries: typeof deliveries;
  documents: typeof documents;
  email: typeof email;
  excel: typeof excel;
  extraction: typeof extraction;
  extractionRun: typeof extractionRun;
  formProposals: typeof formProposals;
  forms: typeof forms;
  googleSheets: typeof googleSheets;
  http: typeof http;
  intake: typeof intake;
  intakeSplit: typeof intakeSplit;
  integrations: typeof integrations;
  invitations: typeof invitations;
  items: typeof items;
  "lib/accounts": typeof lib_accounts;
  "lib/backoff": typeof lib_backoff;
  "lib/billing": typeof lib_billing;
  "lib/clientIp": typeof lib_clientIp;
  "lib/confidence": typeof lib_confidence;
  "lib/documentFiles": typeof lib_documentFiles;
  "lib/documentForm": typeof lib_documentForm;
  "lib/documentPayload": typeof lib_documentPayload;
  "lib/documentStates": typeof lib_documentStates;
  "lib/emailParse": typeof lib_emailParse;
  "lib/eventInfo": typeof lib_eventInfo;
  "lib/excelAdapter": typeof lib_excelAdapter;
  "lib/extract": typeof lib_extract;
  "lib/failure": typeof lib_failure;
  "lib/fieldKeys": typeof lib_fieldKeys;
  "lib/fieldTypes": typeof lib_fieldTypes;
  "lib/filler": typeof lib_filler;
  "lib/fit": typeof lib_fit;
  "lib/formDescription": typeof lib_formDescription;
  "lib/functions": typeof lib_functions;
  "lib/google": typeof lib_google;
  "lib/googleSheetsAdapter": typeof lib_googleSheetsAdapter;
  "lib/http": typeof lib_http;
  "lib/inputLimits": typeof lib_inputLimits;
  "lib/integrationAdapters": typeof lib_integrationAdapters;
  "lib/mailPlan": typeof lib_mailPlan;
  "lib/matchPlan": typeof lib_matchPlan;
  "lib/matcher": typeof lib_matcher;
  "lib/microsoft": typeof lib_microsoft;
  "lib/models": typeof lib_models;
  "lib/oauthState": typeof lib_oauthState;
  "lib/payload": typeof lib_payload;
  "lib/pdfStore": typeof lib_pdfStore;
  "lib/pipeline": typeof lib_pipeline;
  "lib/proposer": typeof lib_proposer;
  "lib/readThinking": typeof lib_readThinking;
  "lib/reader": typeof lib_reader;
  "lib/readerInput": typeof lib_readerInput;
  "lib/reading": typeof lib_reading;
  "lib/reviewState": typeof lib_reviewState;
  "lib/router": typeof lib_router;
  "lib/routerPlan": typeof lib_routerPlan;
  "lib/rows": typeof lib_rows;
  "lib/secrets": typeof lib_secrets;
  "lib/signUpGuard": typeof lib_signUpGuard;
  "lib/signing": typeof lib_signing;
  "lib/sniff": typeof lib_sniff;
  "lib/splitter": typeof lib_splitter;
  "lib/storedEmail": typeof lib_storedEmail;
  "lib/stripe": typeof lib_stripe;
  "lib/usage": typeof lib_usage;
  "lib/verifier": typeof lib_verifier;
  "lib/webhookAdapter": typeof lib_webhookAdapter;
  memberships: typeof memberships;
  notifications: typeof notifications;
  onboarding: typeof onboarding;
  organisations: typeof organisations;
  proposalRun: typeof proposalRun;
  "publicApi/auth": typeof publicApi_auth;
  "publicApi/documentRead": typeof publicApi_documentRead;
  "publicApi/documents": typeof publicApi_documents;
  "publicApi/forms": typeof publicApi_forms;
  "publicApi/openapi/common": typeof publicApi_openapi_common;
  "publicApi/openapi/documentRead": typeof publicApi_openapi_documentRead;
  "publicApi/openapi/documents": typeof publicApi_openapi_documents;
  "publicApi/openapi/forms": typeof publicApi_openapi_forms;
  "publicApi/openapi/index": typeof publicApi_openapi_index;
  "publicApi/openapi/subscriptions": typeof publicApi_openapi_subscriptions;
  "publicApi/openapi/types": typeof publicApi_openapi_types;
  "publicApi/respond": typeof publicApi_respond;
  "publicApi/router": typeof publicApi_router;
  "publicApi/routes": typeof publicApi_routes;
  "publicApi/subscriptions": typeof publicApi_subscriptions;
  rejection: typeof rejection;
  retention: typeof retention;
  review: typeof review;
  subscriptions: typeof subscriptions;
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
