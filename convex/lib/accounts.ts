// A spreadsheet Integration (Google Sheets, Excel) writes as the account an
// Admin connected with OAuth. Reconnecting it (integrations.reconnect) works
// the same for every kind; this is what each provider gives for that. When
// it is removed its token is deleted; the grant at the provider is left
// alone (integrations.removeIntegration says why).
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { DRIVE_FILE_SCOPE, google, googleConsentUrl } from "./google";
import { type Integration, type IntegrationKind, kindOf } from "./integrationAdapters";
import { FILES_SCOPE, microsoft, microsoftConsentUrl } from "./microsoft";
import { encryptSecret } from "./secrets";

export type AccountKind = Exclude<IntegrationKind, "webhook">;

export type AccountProvider = {
  /** The consent page; the provider sends the Admin back to its callback route with `state`. */
  consentUrl(state: string): string;
  /** Trades the code from the consent page for a refresh token; null when the Admin didn't grant what Vink needs. */
  exchangeCode(code: string): Promise<string | null>;
  /** Whether the account of `refreshToken` can open the Integration's spreadsheet. */
  canReach(refreshToken: string, integration: Integration): Promise<boolean>;
};

/** Where Google sends the Admin back to; must be listed on the OAuth client. */
function googleRedirectUri() {
  return `${process.env.SITE_URL}/api/integrations/google/callback`;
}

export const googleAccount: AccountProvider = {
  consentUrl: (state) => googleConsentUrl(googleRedirectUri(), state),
  async exchangeCode(code) {
    const { refreshToken, scopes } = await google.exchangeCode(code, googleRedirectUri());
    return refreshToken !== null && scopes.includes(DRIVE_FILE_SCOPE) ? refreshToken : null;
  },
  async canReach(refreshToken, integration) {
    if (integration.kind !== "google_sheets") return false;
    return await google.canOpen(await google.accessToken(refreshToken), integration.spreadsheetId);
  },
};

/** Where Microsoft sends the Admin back to; must be a Web redirect URI of the app registration. */
function microsoftRedirectUri() {
  return `${process.env.SITE_URL}/api/integrations/microsoft/callback`;
}

export const microsoftAccount: AccountProvider = {
  consentUrl: (state) => microsoftConsentUrl(microsoftRedirectUri(), state),
  async exchangeCode(code) {
    const { refreshToken, scopes } = await microsoft.exchangeCode(code, microsoftRedirectUri());
    // Microsoft names the scope with or without its https://graph.microsoft.com/ prefix.
    const files = scopes.some((s) => [FILES_SCOPE, "Files.ReadWrite"].some((f) => f.toLowerCase() === s.toLowerCase()));
    return refreshToken !== null && files ? refreshToken : null;
  },
  async canReach(refreshToken, integration) {
    if (integration.kind !== "excel") return false;
    const { accessToken } = await microsoft.accessToken(refreshToken);
    return await microsoft.canOpen(accessToken, integration);
  },
};

const providers: { [K in AccountKind]: AccountProvider } = {
  google_sheets: googleAccount,
  excel: microsoftAccount,
};

/**
 * What an adapter calls with the new refresh token a provider handed out
 * (Microsoft rotates them), so the next send starts from it.
 */
export function refreshTokenKeeper(ctx: ActionCtx, integration: Integration) {
  return async (refreshToken: string) => {
    if (!("refreshToken" in integration)) return;
    await ctx.runMutation(internal.integrations.keepRefreshToken, {
      integrationId: integration._id,
      previous: integration.refreshToken,
      refreshToken: await encryptSecret(refreshToken),
    });
  };
}

/**
 * Runs `send` while no other send writes to the same spreadsheet Integration;
 * "busy" when another one does. Two at once would each read the header, and
 * each add a new Field's column. A Webhook needs no turn.
 */
export async function sendAlone<T>(
  ctx: ActionCtx,
  integration: Integration,
  send: () => Promise<T>,
): Promise<T | "busy"> {
  if (accountProviderOf(integration) === null) return await send();
  const turn = { integrationId: integration._id, by: crypto.randomUUID() };
  if (!(await ctx.runMutation(internal.integrations.claimWriting, turn))) return "busy";
  try {
    return await send();
  } finally {
    await ctx.runMutation(internal.integrations.releaseWriting, turn);
  }
}

/** The provider of a kind's connected accounts; null for a Webhook, which has none. */
export function accountProviderFor(kind: string): AccountProvider | null {
  return Object.hasOwn(providers, kind) ? providers[kind as AccountKind] : null;
}

/** The provider of the Integration's connected account; null for a Webhook. */
export function accountProviderOf(integration: Integration): AccountProvider | null {
  return accountProviderFor(kindOf(integration));
}
