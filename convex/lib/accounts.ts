// A spreadsheet Integration (Google Sheets, later Excel) writes as the account
// an Admin connected with OAuth. Reconnecting it (integrations.reconnect) and
// taking its access back when it is removed work the same for every kind;
// this is what each provider gives for that.
import { DRIVE_FILE_SCOPE, google, googleConsentUrl } from "./google";
import { type Integration, type IntegrationKind, kindOf } from "./integrationAdapters";

export type AccountKind = Exclude<IntegrationKind, "webhook">;

export type AccountProvider = {
  /** The consent page; the provider sends the Admin back to its callback route with `state`. */
  consentUrl(state: string): string;
  /** Trades the code from the consent page for a refresh token; null when the Admin didn't grant what Vink needs. */
  exchangeCode(code: string): Promise<string | null>;
  /** Whether the account of `refreshToken` can open the Integration's spreadsheet. */
  canReach(refreshToken: string, integration: Integration): Promise<boolean>;
  /** Takes Vink's access back at the provider. Throws when it didn't answer. */
  revoke(refreshToken: string): Promise<void>;
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
  async revoke(refreshToken) {
    await google.revoke(refreshToken);
  },
};

const providers: { [K in AccountKind]: AccountProvider } = {
  google_sheets: googleAccount,
};

/** The provider of a kind's connected accounts; null for a Webhook, which has none. */
export function accountProviderFor(kind: string): AccountProvider | null {
  return Object.hasOwn(providers, kind) ? providers[kind as AccountKind] : null;
}

/** The provider of the Integration's connected account; null for a Webhook. */
export function accountProviderOf(integration: Integration): AccountProvider | null {
  return accountProviderFor(kindOf(integration));
}
