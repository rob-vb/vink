// Connecting an Excel Integration (Microsoft identity platform, multi-tenant,
// work or school accounts; Graph scope Files.ReadWrite). The Admin starts on
// the Integrations page (`connectUrl`), signs in on Microsoft's page, and
// comes back through the Next route app/api/integrations/microsoft/callback,
// which calls `connect` as that Admin. Vink then makes a new workbook in
// their OneDrive, with a table of the header row, and stores the refresh
// token encrypted. Many companies let only their IT admin consent to an app:
// `adminConsentUrl` is the link the Admin sends them.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { reconnect } from "./integrations";
import { microsoftAccount } from "./lib/accounts";
import { orgAction, orgQuery } from "./lib/functions";
import { adminConsentUrl as consentLink, microsoft, MicrosoftFailure } from "./lib/microsoft";
import { readState, signState } from "./lib/oauthState";
import { DOCUMENT_COLUMNS } from "./lib/rows";
import { encryptSecret } from "./lib/secrets";

/** Microsoft's sign-in page for a new Excel Integration called `name`. */
export const connectUrl = orgAction({
  role: "admin",
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    if (name.trim() === "") throw new ConvexError("An Integration needs a name");
    const organisation = await ctx.runQuery(internal.organisations.slugOf, { organisationId: ctx.organisationId });
    const state = await signState(organisation, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      name: name.trim(),
    });
    return { url: microsoftAccount.consentUrl(state) };
  },
});

/** The page where a company's IT admin consents to Vink for everyone; null when Excel isn't set up here. */
export const adminConsentUrl = orgQuery({
  role: "admin",
  args: {},
  handler: async () => {
    const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
    return { url: clientId ? consentLink(clientId) : null };
  },
});

type Result = "connected" | "reconnected" | "no_access" | "no_sheet_access" | "admin_consent";

/**
 * Finishes the connection: checks the state is this Admin's, trades the code
 * for a refresh token, makes the workbook and stores the Integration. A
 * state that names an Integration is a Reconnect (integrations.reconnect).
 * `no_access`: Microsoft didn't grant the files scope. `admin_consent`: the
 * company lets only its IT admin consent to Vink.
 */
export const connect = orgAction({
  role: "admin",
  args: { state: v.string(), code: v.string() },
  handler: async (ctx, { state, code }): Promise<{ result: Result }> => {
    const claims = await readState(state);
    if (claims === null || claims.organisationId !== ctx.organisationId || claims.userId !== ctx.userId) {
      throw new ConvexError("This Microsoft sign-in has expired. Try again.");
    }
    try {
      if (claims.integrationId !== undefined) {
        return await reconnect(ctx, ctx.organisationId, claims.integrationId as Id<"integrations">, code);
      }
      const refreshToken = await microsoftAccount.exchangeCode(code);
      if (refreshToken === null) return { result: "no_access" };
      const token = await microsoft.accessToken(refreshToken);
      const workbook = await microsoft.createWorkbook(token.accessToken, claims.name, DOCUMENT_COLUMNS);
      await ctx.runMutation(internal.excel.insert, {
        organisationId: ctx.organisationId,
        name: claims.name,
        // The newest refresh token: Microsoft handed out another with the access token.
        refreshToken: await encryptSecret(token.refreshToken ?? refreshToken),
        driveId: workbook.driveId,
        itemId: workbook.itemId,
        tableId: workbook.tableId,
        workbookUrl: workbook.url,
      });
      return { result: "connected" };
    } catch (error) {
      if (error instanceof MicrosoftFailure && error.adminConsent) return { result: "admin_consent" };
      throw error;
    }
  },
});

export const insert = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    name: v.string(),
    refreshToken: v.string(),
    driveId: v.string(),
    itemId: v.string(),
    tableId: v.string(),
    workbookUrl: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"integrations">> =>
    await ctx.db.insert("integrations", { ...args, kind: "excel" }),
});
