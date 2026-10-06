// Connecting a Google Sheets Integration (OAuth 2.0, scope drive.file). The
// Admin starts on the Integrations page (`connectUrl`), consents on Google's
// page, and comes back through the Next route app/api/integrations/google/
// callback, which calls `connect` as that Admin. Vink then makes a new sheet
// in their Drive, with the header row, and stores the refresh token encrypted.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { reconnect } from "./integrations";
import { googleAccount } from "./lib/accounts";
import { orgAction } from "./lib/functions";
import { google } from "./lib/google";
import { readState, signState } from "./lib/oauthState";
import { DOCUMENT_COLUMNS } from "./lib/rows";
import { encryptSecret } from "./lib/secrets";

/** Google's consent page for a new Google Sheets Integration called `name`. */
export const connectUrl = orgAction({
  role: "admin",
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    if (name.trim() === "") throw new ConvexError("An Integration needs a name");
    const organisation = await ctx.runQuery(internal.googleSheets.slugOf, {
      organisationId: ctx.organisationId,
    });
    const state = await signState(organisation, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      name: name.trim(),
    });
    return { url: googleAccount.consentUrl(state) };
  },
});

export const slugOf = internalQuery({
  args: { organisationId: v.id("organisations") },
  handler: async (ctx, { organisationId }) => (await ctx.db.get(organisationId))!.slug,
});

/**
 * Finishes the connection: checks the state is this Admin's, trades the code
 * for a refresh token, makes the sheet and stores the Integration. A state
 * that names an Integration is a Reconnect (integrations.reconnect) instead.
 * `no_access`: the Admin didn't tick the box that lets Vink make the sheet.
 */
export const connect = orgAction({
  role: "admin",
  args: { state: v.string(), code: v.string() },
  handler: async (
    ctx,
    { state, code },
  ): Promise<{ result: "connected" | "reconnected" | "no_access" | "no_sheet_access" }> => {
    const claims = await readState(state);
    if (claims === null || claims.organisationId !== ctx.organisationId || claims.userId !== ctx.userId) {
      throw new ConvexError("This Google sign-in has expired. Try again.");
    }
    if (claims.integrationId !== undefined) {
      return await reconnect(ctx, ctx.organisationId, claims.integrationId as Id<"integrations">, code);
    }
    const refreshToken = await googleAccount.exchangeCode(code);
    if (refreshToken === null) return { result: "no_access" };
    const sheet = await google.createSheet(await google.accessToken(refreshToken), claims.name, DOCUMENT_COLUMNS);
    await ctx.runMutation(internal.googleSheets.insert, {
      organisationId: ctx.organisationId,
      name: claims.name,
      refreshToken: await encryptSecret(refreshToken),
      spreadsheetId: sheet.spreadsheetId,
      sheetId: sheet.sheetId,
      spreadsheetUrl: sheet.url,
    });
    return { result: "connected" };
  },
});

export const insert = internalMutation({
  args: {
    organisationId: v.id("organisations"),
    name: v.string(),
    refreshToken: v.string(),
    spreadsheetId: v.string(),
    sheetId: v.number(),
    spreadsheetUrl: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"integrations">> =>
    await ctx.db.insert("integrations", { ...args, kind: "google_sheets" }),
});
